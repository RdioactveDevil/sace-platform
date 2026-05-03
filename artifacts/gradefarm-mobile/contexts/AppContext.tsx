import AsyncStorage from "@react-native-async-storage/async-storage";
import { Session, User } from "@supabase/supabase-js";
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { getProfile, getQuestions, getStruggleMap, signOut as dbSignOut, type Profile } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { type Question, type StruggleMap } from "@/lib/engine";

export interface Subject {
  id: string;
  name: string;
  stage: string;
  dbName: string;
}

export const SUBJECTS: Subject[] = [
  { id: "chemistry_s1", name: "Chemistry", stage: "Stage 1", dbName: "Chemistry Stage 1" },
  { id: "chemistry_s2", name: "Chemistry", stage: "Stage 2", dbName: "Chemistry Stage 2" },
];

interface AppContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
  loading: boolean;
  questions: Question[];
  questionsLoading: boolean;
  struggleMap: StruggleMap;
  setStruggleMap: React.Dispatch<React.SetStateAction<StruggleMap>>;
  selectedSubject: Subject;
  setSelectedSubjectAndLoad: (subject: Subject) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshStruggleMap: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const SUBJECT_KEY = "gf_mobile_subject";

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [struggleMap, setStruggleMap] = useState<StruggleMap>({});
  const [selectedSubject, setSelectedSubject] = useState<Subject>(SUBJECTS[0]);
  const [subjectReady, setSubjectReady] = useState(false);

  const questionsLoadedForSubject = useRef<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SUBJECT_KEY).then((raw) => {
      if (raw) {
        try {
          const s = JSON.parse(raw) as Subject;
          if (SUBJECTS.find((sub) => sub.id === s.id)) {
            setSelectedSubject(s);
          }
        } catch {}
      }
      setSubjectReady(true);
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.user) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.user) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([getProfile(user.id), getStruggleMap(user.id)])
      .then(([prof, map]) => {
        setProfile(prof);
        setStruggleMap(map);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (!user || !subjectReady) return;
    if (questionsLoadedForSubject.current === selectedSubject.dbName) return;
    loadQuestions(selectedSubject.dbName);
  }, [user, subjectReady, selectedSubject]);

  const loadQuestions = async (dbName: string) => {
    setQuestionsLoading(true);
    questionsLoadedForSubject.current = dbName;
    try {
      const qs = await getQuestions(dbName);
      setQuestions(qs);
    } catch {
      questionsLoadedForSubject.current = null;
    }
    setQuestionsLoading(false);
  };

  const setSelectedSubjectAndLoad = async (subject: Subject) => {
    setSelectedSubject(subject);
    await AsyncStorage.setItem(SUBJECT_KEY, JSON.stringify(subject));
    setQuestions([]);
    questionsLoadedForSubject.current = null;
    await loadQuestions(subject.dbName);
  };

  const handleSignOut = async () => {
    await dbSignOut();
    setProfile(null);
    setQuestions([]);
    setStruggleMap({});
    questionsLoadedForSubject.current = null;
  };

  const refreshProfile = async () => {
    if (!user) return;
    const prof = await getProfile(user.id);
    setProfile(prof);
  };

  const refreshStruggleMap = async () => {
    if (!user) return;
    const map = await getStruggleMap(user.id);
    setStruggleMap(map);
  };

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      session,
      profile,
      setProfile,
      loading,
      questions,
      questionsLoading,
      struggleMap,
      setStruggleMap,
      selectedSubject,
      setSelectedSubjectAndLoad,
      signOut: handleSignOut,
      refreshProfile,
      refreshStruggleMap,
    }),
    [user, session, profile, loading, questions, questionsLoading, struggleMap, selectedSubject]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
