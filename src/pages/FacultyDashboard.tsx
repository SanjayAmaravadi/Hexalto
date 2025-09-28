import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { addDoc, collection, doc, onSnapshot, serverTimestamp, updateDoc, query, where, orderBy, limit, arrayUnion } from 'firebase/firestore';

const FacultyDashboard = () => {
  const { currentUser, userRole, logout } = useAuth();
  const [sessionData, setSessionData] = useState({
    class: '',
    thresholdTime: '15',
    radius: '50'
  });
  const [activeSession, setActiveSession] = useState<any>(null);
  const [sessionCode, setSessionCode] = useState('');
  const [sessionDocId, setSessionDocId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<string>('');
  const navigate = useNavigate();
  const { toast } = useToast();
  const [prevCount, setPrevCount] = useState<number>(0);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser || userRole !== 'faculty') {
      navigate('/login');
    }
  }, [currentUser, userRole, navigate]);

  const generateSessionCode = () => {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
  };

  // Notify when participants count increases
  useEffect(() => {
    if (participants.length > prevCount) {
      toast({ title: 'Student joined', description: `${participants.length} in session` });
    }
    setPrevCount(participants.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants.length]);

  // Countdown updater
  useEffect(() => {
    if (!endAt) {
      setRemaining('');
      return;
    }
    const id = setInterval(() => {
      const now = Date.now();
      const diff = endAt - now;
      if (diff <= 0) {
        setRemaining('00:00');
        clearInterval(id);
        // Auto stop the session when time is up
        stopSession();
        return;
      }
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endAt]);

  // Subscribe to recent attendance submissions for this faculty
  useEffect(() => {
    if (!currentUser) return;
    const attCol = collection(db, 'attendance');
    const qAtt = query(attCol, where('facultyId', '==', currentUser.uid), orderBy('createdAt', 'desc'), limit(5));
    let unsub: (() => void) | null = null;
    let fallbackUnsub: (() => void) | null = null;
    const next = (snap: any) => {
      const rows: any[] = [];
      snap.forEach((d: any) => rows.push({ id: d.id, ...d.data() }));
      // Sort by createdAt desc to ensure newest at top even on fallback/no index
      rows.sort((a: any, b: any) => {
        const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return tb - ta;
      });
      const filtered = rows.filter((r: any) => !(r.hiddenBy || []).includes(currentUser.uid));
      setRecentSessions(filtered);
    };
    unsub = onSnapshot(qAtt, next, (err) => {
      // Index not ready or other error: fall back to no order
      const qFallback = query(attCol, where('facultyId', '==', currentUser.uid), limit(5));
      fallbackUnsub = onSnapshot(qFallback, next);
    });
    return () => { unsub && unsub(); fallbackUnsub && fallbackUnsub(); };
  }, [currentUser]);

  const deleteRecent = async (attId: string) => {
    try {
      setDeletingId(attId);
      await updateDoc(doc(db, 'attendance', attId), { hiddenBy: arrayUnion(currentUser?.uid || '') });
      toast({ title: 'Hidden', description: 'Session hidden from your recent list.' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to hide session.', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const startSession = async () => {
    if (!sessionData.class) {
      toast({
        title: "Error",
        description: "Please select a class",
        variant: "destructive"
      });
      return;
    }

    try {
      const code = generateSessionCode();
      setSessionCode(code);

      const sessionsCol = collection(db, 'sessions');
      // Try to capture faculty location (optional)
      const facultyLocation = await new Promise<{lat: number|null; lng: number|null}>((resolve) => {
        if (!navigator.geolocation) return resolve({ lat: null, lng: null });
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve({ lat: null, lng: null }),
          { enableHighAccuracy: true, timeout: 5000 }
        );
      });

      const createdAt = serverTimestamp();
      const nowMs = Date.now();
      const durationMs = Number(sessionData.thresholdTime) * 60 * 1000;
      const endsAtMs = nowMs + durationMs;
      const newDoc = await addDoc(sessionsCol, {
        code,
        class: sessionData.class,
        thresholdTime: Number(sessionData.thresholdTime),
        radius: Number(sessionData.radius),
        facultyId: currentUser?.uid || null,
        status: 'active',
        createdAt,
        updatedAt: serverTimestamp(),
        facultyLocation,
        endsAtMs
      });

      setSessionDocId(newDoc.id);
      setActiveSession({
        code,
        ...sessionData,
        status: 'active'
      });

      // Setup timer end time (client-side estimate); will render as countdown
      setEndAt(endsAtMs);

      // Listen to participants in real-time
      const participantsCol = collection(db, 'sessions', newDoc.id, 'participants');
      const unsub = onSnapshot(participantsCol, (snap) => {
        const list: any[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setParticipants(list);
      });

      // Clean up listener when session stops
      // Store unsubscribe on window to dispose later
      (window as any).__participantsUnsub && (window as any).__participantsUnsub();
      (window as any).__participantsUnsub = unsub;

      toast({
        title: "Session Started",
        description: `Class code: ${code}`
      });
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to start session', variant: 'destructive' });
    }
  };

  const stopSession = async () => {
    try {
      if (sessionDocId) {
        // mark session ended; do NOT delete yet so Final Summary can read
        await updateDoc(doc(db, 'sessions', sessionDocId), { status: 'ended', updatedAt: serverTimestamp(), endedAt: serverTimestamp() });
      }
    } catch (e) {
      // ignore
    } finally {
      const idForNav = sessionDocId; // preserve before clearing state
      (window as any).__participantsUnsub && (window as any).__participantsUnsub();
      (window as any).__participantsUnsub = null;
      setParticipants([]);
      setActiveSession(null);
      setSessionDocId(null);
      setSessionCode('');
      toast({ title: "Session Ended", description: "Navigating to summary" });
      // Navigate to final summary page
      if (idForNav) navigate(`/final-summary/${idForNav}`);
    }
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

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Faculty Dashboard</h1>
          <Button onClick={handleLogout} variant="outline">
            Logout
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Session Controls */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  {activeSession ? 'Active Session' : 'Start New Session'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!activeSession ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="class">Select Class</Label>
                      <Select 
                        value={sessionData.class} 
                        onValueChange={(value) => 
                          setSessionData({...sessionData, class: value})
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a class" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CS101">Computer Science - CS101</SelectItem>
                          <SelectItem value="MATH201">Mathematics - MATH201</SelectItem>
                          <SelectItem value="PHY301">Physics - PHY301</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="threshold">Threshold Time (minutes)</Label>
                        <Input
                          id="threshold"
                          type="number"
                          value={sessionData.thresholdTime}
                          onChange={(e) => 
                            setSessionData({...sessionData, thresholdTime: e.target.value})
                          }
                          min="1"
                          max="180"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="radius">Geofence Radius (meters)</Label>
                        <Input
                          id="radius"
                          type="number"
                          value={sessionData.radius}
                          onChange={(e) => 
                            setSessionData({...sessionData, radius: e.target.value})
                          }
                          min="10"
                          max="500"
                        />
                      </div>
                    </div>

                    <Button onClick={startSession} className="w-full">
                      Start Session
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="text-center space-y-2">
                      <div className="text-4xl font-bold text-primary">{sessionCode}</div>
                      <p className="text-muted-foreground">Share this code with students</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold">{remaining || '--:--'}</div>
                        <p className="text-sm text-muted-foreground">Time Elapsed</p>
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{participants.length}</div>
                        <p className="text-sm text-muted-foreground">Students Joined</p>
                      </div>
                    </div>

                    <Button onClick={stopSession} variant="destructive" className="w-full">
                      Stop Session
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Live Attendance */}
            {activeSession && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Live Attendance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {participants.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No students joined yet</p>
                    )}
                    {participants.map((p) => (
                      <div key={p.id} className="flex justify-between items-center p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{p.name || p.email || p.userId}</p>
                          <p className="text-sm text-muted-foreground">{p.userId}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm">{p.joinedAt?.toDate ? p.joinedAt.toDate().toLocaleTimeString() : ''}</span>
                          <Badge className="bg-green-100 text-green-800">Present</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Session Info & Recent Sessions */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Session Info</CardTitle>
              </CardHeader>
              <CardContent>
                {activeSession ? (
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span>Class:</span>
                      <span className="font-medium">{activeSession.class}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Threshold:</span>
                      <span className="font-medium">{activeSession.thresholdTime} min</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Radius:</span>
                      <span className="font-medium">{activeSession.radius}m</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <Badge className="bg-green-100 text-green-800">Active</Badge>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">
                    No active session
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Sessions</CardTitle>
              </CardHeader>
              <CardContent>
                {recentSessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recent sessions.</p>
                ) : (
                  <div className="space-y-3">
                    {recentSessions.map((att) => {
                      const summary = att.summary || [];
                      const total = summary.length;
                      const present = summary.filter((s: any) => (s.status || 'present') !== 'absent').length;
                      const created = att.createdAt?.toDate ? att.createdAt.toDate() : null;
                      const when = created ? created.toLocaleString() : '';
                      return (
                        <div key={att.id} className="p-3 border rounded-lg flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">{att.class} - {att.code}</p>
                            <p className="text-sm text-muted-foreground">{present}/{total} present • {when}</p>
                          </div>
                          <Button
                            variant="outline"
                            onClick={() => deleteRecent(att.id)}
                            disabled={deletingId === att.id}
                          >
                            {deletingId === att.id ? 'Removing...' : 'Delete'}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FacultyDashboard;