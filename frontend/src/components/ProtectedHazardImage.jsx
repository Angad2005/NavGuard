import React, { useEffect, useState } from 'react';
import { apiFetch } from '../utils/api';

export function ProtectedImage({ src, alt, className }) {
  const [objectUrl, setObjectUrl] = useState('');

  useEffect(() => {
    let active = true;
    let url;
    if (!src) return undefined;

    apiFetch(src)
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load the saved image.');
        url = URL.createObjectURL(await response.blob());
        if (active) setObjectUrl(url);
        else URL.revokeObjectURL(url);
      })
      .catch((error) => console.warn(error.message));

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [src]);

  return <img src={objectUrl || undefined} alt={alt} className={className} />;
}

export const ProtectedHazardImage = ProtectedImage;
