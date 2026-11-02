import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import type { User } from "firebase/auth";

export type AppRole = "member" | "parent" | "board" | "sponsor";

export interface AuthState {
  user: User | null;
  loading: boolean;
  role: AppRole | null;
  isReviewer: boolean;
  isSponsor: boolean;
  displayName: string;
  refresh: () => void;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roleUserId, setRoleUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setSessionLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setRoleUserId(null);
      setDisplayName("");
      setProfileLoading(false);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);
    setRole(null);
    setRoleUserId(null);
    setDisplayName(user.email ?? "");

    (async () => {
      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (cancelled) return;
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setRole((userData.role as AppRole) || null);
          const firstName = userData.firstName || "";
          const lastName = userData.lastName || "";
          setDisplayName(firstName && lastName ? `${firstName} ${lastName}` : (userData.displayName || user.email || ""));
          setRoleUserId(user.uid);
        } else {
          setRole(null);
          setDisplayName(user.email || "");
          setRoleUserId(user.uid);
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
        setRole(null);
        setDisplayName(user.email || "");
        setRoleUserId(user.uid);
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [user, tick]);

  return {
    user,
    loading: sessionLoading || profileLoading || (!!user && roleUserId !== user.uid),
    role,
    isReviewer: role === "board" || role === "sponsor",
    isSponsor: role === "sponsor",
    displayName,
    refresh: () => setTick((t) => t + 1),
  };
}
