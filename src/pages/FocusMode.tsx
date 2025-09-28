import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';

const FocusMode = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser, userRole } = useAuth();

  const [session, setSession] = useState<any>(null);
  const [remaining, setRemaining] = useState<string>('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Code verification state (10s after entering Focus Mode)
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [codeVerified, setCodeVerified] = useState(false);
  const [verifyAttempts, setVerifyAttempts] = useState(0);

  useEffect(() => {
    if (!currentUser || userRole !== 'student') {
      navigate('/login');
    }
  }, [currentUser, userRole, navigate]);

  // Subscribe to the session
  useEffect(() => {
    if (!sessionId) return;
    const unsub = onSnapshot(doc(db, 'sessions', sessionId), (snap) => {
      if (!snap.exists()) {
        toast({ title: 'Session ended', description: 'The faculty ended the session' });
        try { if (document.fullscreenElement) { document.exitFullscreen?.(); } } catch {}
        navigate('/student-dashboard');
        return;
      }
      setSession({ id: snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [sessionId, toast, navigate]);

  // Request fullscreen and start countdown
  useEffect(() => {
    (async () => {
      try { await document.documentElement.requestFullscreen?.(); } catch {}
    })();
  }, []);

  // Open code verification dialog after 10 seconds
  useEffect(() => {
    if (!session) return;
    const t = setTimeout(() => {
      if (!codeVerified) setVerifyOpen(true);
    }, 10000);
    return () => clearTimeout(t);
  }, [session, codeVerified]);

  // If the verification dialog is open and not completed within 30s, mark absent and exit
  useEffect(() => {
    if (!verifyOpen || codeVerified) return;
    let cancelled = false;
    const to = setTimeout(async () => {
      if (cancelled || codeVerified) return;
      try {
        if (sessionId && currentUser?.uid) {
          const pRef = doc(db, 'sessions', sessionId, 'participants', currentUser.uid);
          await updateDoc(pRef, {
            status: 'absent',
            present: false,
            exitedEarly: true,
            exitedAt: serverTimestamp(),
            codeVerified: false,
            codeTimeoutAbsent: true,
          });
        }
      } catch {}
      setVerifyOpen(false);
      try { if (document.fullscreenElement) { document.exitFullscreen?.(); } } catch {}
      navigate('/student-dashboard');
    }, 30000);
    return () => { cancelled = true; clearTimeout(to); };
  }, [verifyOpen, codeVerified, sessionId, currentUser, navigate]);

  // Safety: ensure any camera/mic streams are stopped within 3 seconds after entering Focus Mode
  useEffect(() => {
    const stopAllMediaStreams = () => {
      // Stop streams attached to any media elements
      const mediaEls: (HTMLVideoElement | HTMLAudioElement)[] = Array.from(document.querySelectorAll('video, audio')) as any;
      mediaEls.forEach((el) => {
        const src: any = (el as any).srcObject;
        if (src && typeof src.getTracks === 'function') {
          try { src.getTracks().forEach((t: MediaStreamTrack) => t.stop()); } catch {}
        }
        (el as any).srcObject = null;
      });
      // Also stop any globally tracked streams from StudentDashboard
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
    // Run immediately, and then repeatedly for 5 seconds (every 500ms)
    stopAllMediaStreams();
    const end = Date.now() + 5000;
    const int = setInterval(() => {
      stopAllMediaStreams();
      if (Date.now() >= end) clearInterval(int);
    }, 500);
    return () => clearInterval(int);
  }, []);

  useEffect(() => {
    if (!session?.endsAtMs) {
      setRemaining('');
      return;
    }
    const id = setInterval(() => {
      const now = Date.now();
      const diff = session.endsAtMs - now;
      if (diff <= 0) {
        setRemaining('00:00');
        clearInterval(id);
        try { if (document.fullscreenElement) { document.exitFullscreen?.(); } } catch {}
        toast({ title: 'Time up', description: 'The session time has ended.' });
        navigate('/student-dashboard');
        return;
      }
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(id);
  }, [session?.endsAtMs, toast, navigate]);

  if (!session) return null;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Card className="border-green-500">
          <CardHeader className="text-center">
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              Class in Session
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold">{session.class}</h3>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{remaining || '--:--'}</div>
              <p className="text-sm text-muted-foreground">Time Remaining</p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span>GPS Status:</span>
                {session?.facultyLocation?.lat && session?.facultyLocation?.lng ? (
                  <Badge variant="secondary" className="bg-green-100 text-green-800">Enabled</Badge>
                ) : (
                  <Badge variant="secondary">Unknown</Badge>
                )}
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
              onClick={() => setConfirmOpen(true)}
              variant="outline"
              className="w-full"
            >
              Exit Session
            </Button>
          </CardContent>
        </Card>
      </div>
      {/* Exit confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exit Focus Mode?</DialogTitle>
            <DialogDescription>
              If you exit Focus Mode now, you will be marked as Absent for this class.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  if (sessionId && currentUser?.uid) {
                    const pRef = doc(db, 'sessions', sessionId, 'participants', currentUser.uid);
                    await updateDoc(pRef, {
                      status: 'absent',
                      present: false,
                      exitedEarly: true,
                      exitedAt: serverTimestamp(),
                    });
                  }
                } catch {}
                setConfirmOpen(false);
                try { if (document.fullscreenElement) { document.exitFullscreen?.(); } } catch {}
                navigate('/student-dashboard');
              }}
            >
              Exit & Mark Absent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 10s Unique Code Verification dialog */}
      <Dialog open={verifyOpen} onOpenChange={(open) => { if (codeVerified) setVerifyOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Verification Code</DialogTitle>
            <DialogDescription>
              Please enter the class code shown by your faculty to confirm your presence.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Enter code"
              value={verifyInput}
              onChange={(e) => { setVerifyInput(e.target.value.toUpperCase()); setVerifyError(null); }}
              maxLength={12}
            />
            {verifyError && (
              <p className="text-sm text-red-600">{verifyError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                const expected = String(session?.code || '').toUpperCase().trim();
                const got = verifyInput.toUpperCase().trim();
                if (!got) { setVerifyError('Please enter the code.'); return; }
                if (got !== expected) {
                  const nextAttempts = verifyAttempts + 1;
                  setVerifyAttempts(nextAttempts);
                  const remaining = Math.max(0, 3 - nextAttempts);
                  if (nextAttempts >= 3) {
                    // Mark absent and force exit
                    try {
                      if (sessionId && currentUser?.uid) {
                        const pRef = doc(db, 'sessions', sessionId, 'participants', currentUser.uid);
                        await updateDoc(pRef, {
                          status: 'absent',
                          present: false,
                          exitedEarly: true,
                          exitedAt: serverTimestamp(),
                          codeVerified: false,
                          codeAttemptsExceeded: true,
                        });
                      }
                    } catch {}
                    setVerifyOpen(false);
                    try { if (document.fullscreenElement) { document.exitFullscreen?.(); } } catch {}
                    // Navigate out of focus mode
                    navigate('/student-dashboard');
                    return;
                  } else {
                    setVerifyError(`Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
                    return;
                  }
                }
                try {
                  if (sessionId && currentUser?.uid) {
                    const pRef = doc(db, 'sessions', sessionId, 'participants', currentUser.uid);
                    await updateDoc(pRef, {
                      status: 'present',
                      present: true,
                      exitedEarly: false,
                      codeAttemptsExceeded: false,
                      codeVerified: true,
                      codeVerifiedAt: serverTimestamp(),
                    });
                  }
                } catch {}
                setCodeVerified(true);
                setVerifyOpen(false);
              }}
            >
              Verify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FocusMode;

// Exit confirmation dialog mounted with the page
// Note: place after default export in file body is not allowed; integrate within component instead
