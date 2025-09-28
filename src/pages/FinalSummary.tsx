import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { db } from '@/lib/firebase';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

interface ParticipantRec {
  id: string;
  userId?: string;
  email?: string;
  name?: string;
  joinedAt?: any;
  location?: { lat: number | null; lng: number | null } | null;
  status?: 'present' | 'absent' | 'late';
}

const toHHMM = (d?: Date) => {
  if (!d) return '';
  return d.toLocaleTimeString();
};

const distanceMeters = (a?: {lat:number|null; lng:number|null} | null, b?: {lat:number|null; lng:number|null} | null) => {
  if (!a?.lat || !a?.lng || !b?.lat || !b?.lng) return null;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad((b.lat as number) - (a.lat as number));
  const dLon = toRad((b.lng as number) - (a.lng as number));
  const la1 = toRad(a.lat as number);
  const la2 = toRad(b.lat as number);
  const h = Math.sin(dLat/2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Math.round(R * c);
};

const FinalSummary = () => {
  const { sessionId } = useParams();
  const [session, setSession] = useState<any>(null);
  const [participants, setParticipants] = useState<ParticipantRec[]>([]);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      if (!sessionId) return;
      const sRef = doc(db, 'sessions', sessionId);
      const sSnap = await getDoc(sRef);
      if (!sSnap.exists()) {
        toast({ title: 'Not found', description: 'Session not found', variant: 'destructive' });
        return;
      }
      const sData = { id: sSnap.id, ...sSnap.data() } as any;
      setSession(sData);
      const pSnap = await getDocs(collection(db, 'sessions', sessionId, 'participants'));
      const list: ParticipantRec[] = [];
      pSnap.forEach(d => list.push({ id: d.id, ...(d.data() as any) }));
      // default status present
      list.forEach(p => { if (!p.status) p.status = 'present'; });
      setParticipants(list);
    };
    fetchData();
  }, [sessionId, toast]);

  const handleStatusChange = (id: string, status: ParticipantRec['status']) => {
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, status } : p));
  };

  const submitAttendance = async () => {
    if (!sessionId || !session) return;
    setSaving(true);
    try {
      // write an attendance record
      const attRef = doc(collection(db, 'attendance'));
      await setDoc(attRef, {
        sessionId,
        class: session.class,
        code: session.code,
        thresholdTime: session.thresholdTime,
        radius: session.radius,
        createdAt: serverTimestamp(),
        facultyId: session.facultyId || null,
        // For efficient student-side queries
        summaryUserIds: participants.map(p => p.userId || p.id).filter(Boolean),
        summary: participants.map(p => ({
          id: p.id,
          userId: p.userId || null,
          name: p.name || null,
          email: p.email || null,
          status: p.status || 'present',
          distance: distanceMeters(p.location || null, session.facultyLocation || null)
        }))
      });

      // mark session archived, then delete it to clear active lists
      await updateDoc(doc(db, 'sessions', sessionId), { status: 'archived', archivedAt: serverTimestamp() });
      await deleteDoc(doc(db, 'sessions', sessionId));

      toast({ title: 'Attendance submitted', description: 'Attendance has been recorded.' });
      navigate('/faculty-dashboard');
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to submit attendance', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const header = useMemo(() => {
    if (!session) return null;
    return (
      <div className="space-y-1">
        <div className="flex gap-4 flex-wrap">
          <Badge>Class: {session.class}</Badge>
          <Badge>Code: {session.code}</Badge>
          <Badge>Threshold: {session.thresholdTime} min</Badge>
          <Badge>Radius: {session.radius} m</Badge>
        </div>
      </div>
    );
  }, [session]);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Final Summary</h1>
          <Button variant="outline" onClick={() => navigate('/faculty-dashboard')}>Back</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Session Details</CardTitle>
          </CardHeader>
          <CardContent>
            {header}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Participants</CardTitle>
          </CardHeader>
          <CardContent>
            {participants.length === 0 ? (
              <p className="text-sm text-muted-foreground">No participants joined.</p>
            ) : (
              <div className="space-y-3">
                {participants.map(p => {
                  const dist = distanceMeters(p.location || null, session?.facultyLocation || null);
                  return (
                    <div key={p.id} className="grid grid-cols-1 md:grid-cols-5 items-center gap-3 p-3 border rounded-lg">
                      <div className="md:col-span-2">
                        <div className="font-medium">{p.name || p.email || p.userId}</div>
                        <div className="text-xs text-muted-foreground">{p.userId}</div>
                      </div>
                      <div>
                        <div className="text-sm">Distance</div>
                        <div className="font-medium">{dist == null ? 'N/A' : `${dist} m`}</div>
                      </div>
                      <div>
                        <Label htmlFor={`status-${p.id}`} className="text-sm">Status</Label>
                        <select id={`status-${p.id}`} className="block border rounded px-2 py-1 w-full" value={p.status}
                          onChange={(e) => handleStatusChange(p.id, e.target.value as any)}>
                          <option value="present">Present</option>
                          <option value="late">Late</option>
                          <option value="absent">Absent</option>
                        </select>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Joined</div>
                        <div className="text-sm">{p.joinedAt?.toDate ? toHHMM(p.joinedAt.toDate()) : ''}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={submitAttendance} disabled={saving || participants.length === 0}>
            {saving ? 'Submitting...' : 'Submit Attendance'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FinalSummary;
