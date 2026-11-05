import React from "react";
import { useEffect, useState } from 'react';

/** Enrutador mínimo basado en el hash (#/login). Sirve con cualquier hosting estático. */
function parse() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs)) };
}

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const navigate = (path) => {
  window.location.hash = path;
};
export const Link = ({ to, ...props }) => <a href={`#${to}`} {...props} />;
