
export const ROUTE_COORDS: Record<string, { lat: number; lng: number }> = {
  "Vijayawada": { lat: 16.5062, lng: 80.6480 },
  "Guntur": { lat: 16.3067, lng: 80.4365 },
  "Visakhapatnam": { lat: 17.6868, lng: 83.2185 },
  "Vizianagaram": { lat: 18.1067, lng: 83.3956 },
  "Tirupati": { lat: 13.6285, lng: 79.4192 },
  "Chittoor": { lat: 13.2172, lng: 79.1003 },
  "Kurnool": { lat: 15.8281, lng: 78.0373 },
  "Nandyal": { lat: 15.4847, lng: 78.4812 },
  "Nellore": { lat: 14.4426, lng: 79.9865 },
  "Ongole": { lat: 15.5057, lng: 80.0499 },
  "Anantapur": { lat: 14.6819, lng: 77.6006 },
  "Kadapa": { lat: 14.4673, lng: 78.8242 }
};

export const STANDARD_DISTANCES: Record<string, string> = {
  "Vijayawada - Guntur": "32.4 KM",
  "Visakhapatnam - Vizianagaram": "61.2 KM",
  "Tirupati - Chittoor": "72.0 KM",
  "Kurnool - Nandyal": "74.8 KM",
  "Nellore - Ongole": "131.5 KM",
  "Anantapur - Kadapa": "144.2 KM"
};

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Radius of earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

export const getCurrentLocation = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) reject("Geolocation not supported");
    navigator.geolocation.getCurrentPosition(resolve, reject, { 
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0
    });
  });
};
