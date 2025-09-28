import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail 
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, getDoc, collection, getDocs, limit, query, where } from 'firebase/firestore';

interface AuthContextType {
  currentUser: User | null;
  userRole: 'faculty' | 'student' | null;
  login: (identifier: string, password: string) => Promise<'faculty' | 'student'>; // identifier can be email or ID
  signup: (
    email: string,
    password: string,
    role: 'faculty' | 'student',
    name: string,
    options?: { id?: string; mobile?: string }
  ) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<'faculty' | 'student' | null>(null);
  const [loading, setLoading] = useState(true);

  const signup = async (
    email: string,
    password: string,
    role: 'faculty' | 'student',
    name: string,
    options?: { id?: string; mobile?: string }
  ) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // Store additional user data in Firestore
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      name,
      email,
      role,
      id: options?.id || null,
      mobile: options?.mobile || null,
      createdAt: new Date().toISOString()
    });
  };

  const login = async (identifier: string, password: string) => {
    // If identifier looks like an email, use it directly. Otherwise resolve by ID/username.
    let emailToUse = identifier;
    if (!identifier.includes('@')) {
      // Try to resolve identifier to email by querying users collection for id == identifier
      const qUsers = query(collection(db, 'users'), where('id', '==', identifier), limit(1));
      const snap = await getDocs(qUsers);
      if (snap.empty) {
        throw new Error('No user found for the provided ID');
      }
      const data = snap.docs[0].data();
      if (!data.email) {
        throw new Error('User record does not have an email');
      }
      emailToUse = data.email as string;
    }

    const cred = await signInWithEmailAndPassword(auth, emailToUse, password);
    // Immediately fetch and set role so callers can navigate reliably
    const u = cred.user;
    const userDoc = await getDoc(doc(db, 'users', u.uid));
    if (userDoc.exists()) {
      const role = userDoc.data().role as 'faculty' | 'student';
      setUserRole(role);
      return role;
    }
    // Fallback: try current user or throw
    throw new Error('User role not found');
  };

  const logout = async () => {
    await signOut(auth);
    setUserRole(null);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        // Fetch user role from Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setUserRole(userDoc.data().role);
        }
      } else {
        setUserRole(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value: AuthContextType = {
    currentUser,
    userRole,
    login,
    signup,
    logout,
    resetPassword,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};