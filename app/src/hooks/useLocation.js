import { useState, useEffect, useRef } from 'react';
import * as Location from 'expo-location';

// Reusable hook — used by MapScreen (display) and RunScreen (tracking)
// Returns the current location, permission status, and control functions

export function useLocation({ watchWhileMounted = false } = {}) {
  const [location, setLocation]         = useState(null);
  const [permission, setPermission]     = useState(null);  // 'granted' | 'denied' | 'undetermined'
  const [error, setError]               = useState(null);
  const watcherRef                      = useRef(null);

  // Check existing permission on first mount
  useEffect(() => {
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      setPermission(status);
      if (status === 'granted' && watchWhileMounted) {
        startWatching();
      }
    })();

    return () => stopWatching();
  }, []);

  // Ask for permission (call this from a button press)
  const requestPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setPermission(status);
    if (status === 'granted' && watchWhileMounted) {
      startWatching();
    }
    return status;
  };

  // Get a single fast fix — used to center the map once on open
  const getOnce = async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation(pos.coords);
      return pos.coords;
    } catch (err) {
      setError(err.message);
      return null;
    }
  };

  // Start continuous watching — used during a run
  const startWatching = async () => {
    if (watcherRef.current) return; // already watching
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation(pos.coords);

      watcherRef.current = await Location.watchPositionAsync(
        {
          accuracy:         Location.Accuracy.High,
          timeInterval:     2000,   // update every 2 seconds
          distanceInterval: 5,      // or every 5 metres moved
        },
        (update) => {
          // Skip GPS points with very poor accuracy (>50m) — anti-cheat filtering
          if (update.coords.accuracy && update.coords.accuracy > 50) return;
          setLocation(update.coords);
        }
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const stopWatching = () => {
    if (watcherRef.current) {
      watcherRef.current.remove();
      watcherRef.current = null;
    }
  };

  return {
    location,
    permission,
    error,
    requestPermission,
    getOnce,
    startWatching,
    stopWatching,
  };
}