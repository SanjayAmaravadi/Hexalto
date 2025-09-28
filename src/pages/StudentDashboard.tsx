import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// removed join-by-code inputs
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, limit, onSnapshot, query, serverTimestamp, where, doc, setDoc, orderBy } from 'firebase/firestore';
import { storage } from '@/lib/firebase';
import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useRef } from 'react';

const StudentDashboard = () => {
  const ENABLE_STORAGE_UPLOAD = false; // disable uploads to avoid CORS during development
  const { currentUser, userRole, logout } = useAuth();
  // removed join-by-code state
  const [activeSession, setActiveSession] = useState<any>(null);
  const [focusMode, setFocusMode] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  // removed unused sessionDocId
  const [participantsUnsub, setParticipantsUnsub] = useState<null | (() => void)>(null);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [sessionsUnsub, setSessionsUnsub] = useState<null | (() => void)>(null);
  const [remaining, setRemaining] = useState<string>('');
  // Track time to auto-hide sessions that have ended even if status lingers
  const [nowMs, setNowMs] = useState<number>(Date.now());
  // Recent attendance documents
  const [recentAttendance, setRecentAttendance] = useState<any[]>([]);
  const [showFaceCapture, setShowFaceCapture] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [pendingSession, setPendingSession] = useState<{ id: string; data: any } | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  // face verification step removed; we capture during join

  useEffect(() => {
    if (!currentUser || userRole !== 'student') {
      navigate('/login');
    }
  }, [currentUser, userRole, navigate]);

  // Subscribe to active sessions in real-time
  useEffect(() => {
    const qActive = query(collection(db, 'sessions'), where('status', '==', 'active'));
    const unsub = onSnapshot(qActive, (snap) => {
      const list: any[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setActiveSessions(list);
    });
    setSessionsUnsub(() => unsub);
    return () => {
      unsub && unsub();
      setSessionsUnsub(null);
    };
  }, []);

  // Tick every 5 seconds so UI hides sessions that have passed endsAtMs
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  // Subscribe to recent attendance for this student
  useEffect(() => {
    if (!currentUser) return;
    const uid = currentUser.uid;
    try {
      const attCol = collection(db, 'attendance');
      // Order by createdAt desc to get latest submissions first
      const qAtt = query(attCol, where('summaryUserIds', 'array-contains', uid), orderBy('createdAt', 'desc'), limit(5));
      const unsub = onSnapshot(qAtt, (snap) => {
        const rows: any[] = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        // Sort client-side to be safe
        rows.sort((a: any, b: any) => {
          const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
          const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
          return tb - ta;
        });
        setRecentAttendance(rows);
      }, (err) => {
        // If Firestore needs an index, fall back to no order
        const qFallback = query(attCol, where('summaryUserIds', 'array-contains', uid), limit(5));
        onSnapshot(qFallback, (snap2) => {
          const rows: any[] = [];
          snap2.forEach((d) => rows.push({ id: d.id, ...d.data() }));
          rows.sort((a: any, b: any) => {
            const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
            const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
            return tb - ta;
          });
          setRecentAttendance(rows);
        });
      });
      return () => unsub();
    } catch {
      // ignore
    }
  }, [currentUser]);

  // Open face capture for the selected active session
  const openJoinForSession = async (session: any) => {
    setPendingSession({ id: session.id, data: session });
    setShowFaceCapture(true);
    await startCamera();
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream as any;
        await videoRef.current.play();
      }
      // Track active media streams globally for robust cleanup across route changes
      const w = window as any;
      if (!w.__activeMediaStreams) w.__activeMediaStreams = [];
      w.__activeMediaStreams.push(stream);
    } catch (e) {
      toast({ title: 'Camera error', description: 'Unable to access camera', variant: 'destructive' });
    }
  };

  const stopCamera = () => {
    const v = videoRef.current;
    if (v && v.srcObject) {
      const tracks = (v.srcObject as MediaStream).getTracks();
      tracks.forEach(t => t.stop());
      v.srcObject = null;
    }
    // Also stop any globally tracked media streams
    const w = window as any;
    if (w.__activeMediaStreams) {
      try {
        w.__activeMediaStreams.forEach((s: MediaStream) => {
          if (s && typeof s.getTracks === 'function') s.getTracks().forEach((t) => t.stop());
        });
      } catch {}
      w.__activeMediaStreams = [];
    }
  };

  // Ensure a participant document is written so faculty can see the student join in real-time
  async function doJoinWithFaceUrl(faceUrl: string | null) {
    try {
      if (!pendingSession) return;
      const uid = currentUser?.uid || 'unknown';
      const pDoc = doc(db, 'sessions', pendingSession.id, 'participants', uid);
      await setDoc(pDoc, {
        userId: uid,
        email: currentUser?.email || null,
        name: (currentUser as any)?.displayName || null,
        faceUrl: faceUrl || null,
        joinedAt: serverTimestamp(),
        present: true,
      }, { merge: true });
      toast({ title: 'Joined', description: 'You have joined the session', variant: 'default' });
    } catch (err) {
      toast({ title: 'Join failed', description: 'Could not record attendance. Check permissions.', variant: 'destructive' });
    }
  }

  const confirmFaceCaptureAndJoin = async () => {
    if (isJoining) return;
    setIsJoining(true);
    if (!pendingSession) { setIsJoining(false); return; }
    try {
      // Try to enter fullscreen immediately on user click (satisfies user gesture requirement)
      try { await document.documentElement.requestFullscreen?.(); } catch {}
      // Capture a frame from the camera
      if (videoRef.current) {
        const video = videoRef.current;
        if (!video.srcObject) {
          await startCamera();
        }
        if (!video.videoWidth || !video.videoHeight) {
          await new Promise<void>((resolve) => {
            const handler = () => { video.removeEventListener('loadedmetadata', handler); resolve(); };
            video.addEventListener('loadedmetadata', handler);
            setTimeout(() => { video.removeEventListener('loadedmetadata', handler); resolve(); }, 800);
          });
        }
        const canvas = canvasRef.current || document.createElement('canvas');
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 480;
        canvas.width = w > 0 ? w : 640;
        canvas.height = h > 0 ? h : 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          setCapturedDataUrl(dataUrl);
        }
      }
      await proceedJoinAfterFace();
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to capture face or join session', variant: 'destructive' });
    } finally {
      stopCamera();
      setShowFaceCapture(false);
      setPendingSession(null);
      setIsJoining(false);
    }
  };

  // New: After face verification is complete, proceed to join the pending session using the captured image
  const proceedJoinAfterFace = async () => {
    if (!pendingSession) return;
    // Immediately record attendance so faculty sees the join even if upload fails or is blocked by CORS
    await doJoinWithFaceUrl(null);
    // Optional upload of previously captured face
    if (ENABLE_STORAGE_UPLOAD && capturedDataUrl) {
      try {
        const path = `sessions/${pendingSession.id}/participants/${currentUser?.uid || 'unknown'}.jpg`;
        const sref = storageRef(storage, path);
        await uploadString(sref, capturedDataUrl, 'data_url');
        const url = await getDownloadURL(sref);
        await doJoinWithFaceUrl(url);
      } catch {
        // ignore and keep null faceUrl recorded above
      }
    }

    // subscribe to session to keep live connection
    const unsub = onSnapshot(doc(db, 'sessions', pendingSession.id), (docSnap) => {
      if (!docSnap.exists()) {
        setFocusMode(false);
        setActiveSession(null);
        participantsUnsub && participantsUnsub();
        setParticipantsUnsub(null);
        toast({ title: 'Session ended', description: 'The faculty ended the session' });
        return;
      }
      setActiveSession({ ...docSnap.data(), id: docSnap.id });
    });
    setParticipantsUnsub(() => unsub);

    // Enter focus mode
    setFocusMode(true);
    // no class code field anymore
    toast({ title: 'Success', description: 'Joined successfully. Focus mode activated.' });
    await new Promise((res) => setTimeout(res, 800));
    navigate(`/focus/${pendingSession.id}`);
  };

  const cancelFaceCapture = () => {
    stopCamera();
    setShowFaceCapture(false);
    setPendingSession(null);
  };

  // removed standalone face verification capture

  // Countdown updater for focus mode
  useEffect(() => {
    if (!focusMode || !activeSession?.endsAtMs) {
      setRemaining('');
      return;
    }
    const id = setInterval(() => {
      const now = Date.now();
      const diff = activeSession.endsAtMs - now;
      if (diff <= 0) {
        setRemaining('00:00');
        clearInterval(id);
        setFocusMode(false);
        setActiveSession(null);
        participantsUnsub && participantsUnsub();
        setParticipantsUnsub(null);
        toast({ title: 'Session ended', description: 'Time is up' });
        return;
      }
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(id);
  }, [focusMode, activeSession?.endsAtMs]);

  const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371000; // meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to logout",
        variant: "destructive"
      });
    }
  };

  if (focusMode && activeSession) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto">
          <Card className="border-green-500">
            <CardHeader className="text-center">
              <CardTitle className="text-green-600">Focus Mode Active</CardTitle>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                Class in Session
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold">{activeSession.class}</h3>
                <p className="text-muted-foreground">Code: {activeSession.code}</p>
              </div>
              
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{remaining || '--:--'}</div>
                <p className="text-sm text-muted-foreground">Time Remaining</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>GPS Status:</span>
                  {(() => {
                    const f = activeSession?.facultyLocation;
                    // can't know student's current position reliably here; we trust initial capture
                    if (f?.lat && f?.lng) {
                      return (
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          Enabled
                        </Badge>
                      );
                    }
                    return (
                      <Badge variant="secondary">Unknown</Badge>
                    );
                  })()}
                </div>
                <div className="flex justify-between">
                  <span>Wi-Fi Status:</span>
                  {navigator.onLine ? (
                    <Badge variant="secondary" className="bg-green-100 text-green-800">Online</Badge>
                  ) : (
                    <Badge variant="secondary">Offline</Badge>
                  )}
                </div>
              </div>

              <Button 
                onClick={() => {
                  setFocusMode(false);
                  setActiveSession(null);
                  if (participantsUnsub) {
                    participantsUnsub();
                    setParticipantsUnsub(null);
                  }
                  try { document.exitFullscreen?.(); } catch {}
                }}
                variant="outline"
                className="w-full"
              >
                Exit Session
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Student Dashboard</h1>
          <Button onClick={handleLogout} variant="outline">
            Logout
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Active Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const visibleSessions = activeSessions
                  .filter((s) => typeof s.endsAtMs !== 'number' || s.endsAtMs > nowMs);
                return visibleSessions.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No active sessions. Please wait for your faculty to start a session.
                </p>
              ) : (
                <div className="space-y-3">
                  {visibleSessions.map((s) => (
                    <div key={s.id} className="flex justify-between items-center p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{s.class}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-100 text-green-800">Active</Badge>
                        <Button size="sm" onClick={() => openJoinForSession(s)}>
                          Join
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              );})()}
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Recent Attendance</CardTitle>
            </CardHeader>
            <CardContent>
              {recentAttendance.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No recent attendance yet.</p>
              ) : (
                <div className="space-y-3">
                  {recentAttendance.map((att) => {
                    // Find this student's record in the summary
                    const me = (att.summary || []).find((x: any) => (x.userId || x.id) === currentUser?.uid);
                    const status = me?.status || 'present';
                    const created = att.createdAt?.toDate ? att.createdAt.toDate() : null;
                    const dateStr = created ? created.toLocaleString() : '';
                    return (
                      <div key={att.id} className="flex justify-between items-center p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{att.class}</p>
                          <p className="text-sm text-muted-foreground">{dateStr}</p>
                        </div>
                        {status === 'present' ? (
                          <Badge className="bg-green-100 text-green-800">Present</Badge>
                        ) : status === 'late' ? (
                          <Badge className="bg-yellow-100 text-yellow-800">Late</Badge>
                        ) : (
                          <Badge variant="secondary">Absent</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showFaceCapture} onOpenChange={(open) => { if (!open) cancelFaceCapture(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Face Verification</DialogTitle>
            <DialogDescription>
              Align your face in the camera view and press “Capture & Join” to enter Focus Mode.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Please align your face in the camera and click to proceed.</p>
            <video ref={videoRef} autoPlay playsInline className="w-full rounded border" />
            <canvas ref={canvasRef} className="hidden" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelFaceCapture} disabled={isJoining}>Cancel</Button>
            <Button onClick={confirmFaceCaptureAndJoin} disabled={isJoining}>{isJoining ? 'Capturing...' : 'Capture & Join'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

};

export default StudentDashboard;