import { useCallback, useEffect, useRef, useState } from "react";

type Primitive = string | number | boolean;
type Value = Primitive | Primitive[] | null | undefined;
type State = Record<string, Value>;

function serialize(state: State): string {
  const params = new URLSearchParams();
  Object.entries(state).forEach(([key, value]) => {
    if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) return;
    if (Array.isArray(value)) params.set(key, value.join(","));
    else if (typeof value === "boolean") params.set(key, value ? "1" : "0");
    else params.set(key, String(value));
  });
  const s = params.toString();
  return s ? `?${s}` : "";
}

function deserialize(search: string, schema: State): State {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const result: State = { ...schema };
  Object.keys(schema).forEach((key) => {
    const raw = params.get(key);
    if (raw == null) return;
    const fallback = schema[key];
    if (Array.isArray(fallback)) {
      result[key] = raw ? raw.split(",").filter(Boolean) : [];
    } else if (typeof fallback === "number") {
      const n = Number(raw);
      result[key] = Number.isFinite(n) ? n : fallback;
    } else if (typeof fallback === "boolean") {
      result[key] = raw === "1" || raw === "true";
    } else {
      result[key] = raw;
    }
  });
  return result;
}

function readHash(namespace: string): string {
  try {
    const hash = window.location.hash.slice(1);
    const idx = hash.indexOf("?");
    if (idx === -1) return "";
    const scope = hash.slice(0, idx);
    if (scope && scope !== namespace) return "";
    return hash.slice(idx);
  } catch {
    return "";
  }
}

function writeHash(namespace: string, search: string) {
  try {
    const next = search ? `${namespace}${search}` : namespace;
    const current = window.location.hash.slice(1);
    const scope = current.includes("?") ? current.slice(0, current.indexOf("?")) : current;
    if (scope && scope !== namespace) return;
    if (next === current) return;
    window.history.replaceState(null, "", `#${next}`);
  } catch {
    /* no-op */
  }
}

export function useUrlState<T extends State>(namespace: string, initial: T) {
  const initialRef = useRef(initial);
  const [state, setState] = useState<T>(() => {
    try {
      const fromHash = readHash(namespace);
      if (fromHash) return deserialize(fromHash, initial) as T;
      const stored = localStorage.getItem(`admin:filters:${namespace}`);
      if (stored) return deserialize(stored, initial) as T;
    } catch {
      /* no-op */
    }
    return initial;
  });

  useEffect(() => {
    const search = serialize(state);
    writeHash(namespace, search);
    try {
      localStorage.setItem(`admin:filters:${namespace}`, search);
    } catch {
      /* no-op */
    }
  }, [state, namespace]);

  const update = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setState(initialRef.current);
  }, []);

  const isDirty =
    Object.keys(initialRef.current).some((k) => {
      const a = (state as State)[k];
      const b = (initialRef.current as State)[k];
      if (Array.isArray(a) && Array.isArray(b))
        return a.length !== b.length || a.some((v, i) => v !== b[i]);
      return a !== b;
    });

  return { state, setState, update, reset, isDirty };
}
