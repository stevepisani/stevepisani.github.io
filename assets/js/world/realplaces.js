// The real places behind the doors: the facts both sides need. The planet (places.js: the door,
// its plaque, the panorama in its opening) and the place itself (portal.js, its own bundle) both
// import this, so neither imports the other.
export const REAL_PLACES = {
  sala: {
    name: 'Sala Thai',
    where: 'East-West Center, Honolulu',
    splat: '/assets/splats/sala-thai.sog', // tools/splat-place.mjs, from the scan below
    // how splat-place.mjs cuts it from the scan's levels of detail (0 finest): the finest it keeps
    // close to the pavilion, coarser further out, nothing past the last ring, nothing faint
    scan: { id: '34ac01fc', centre: [46.7, 19.7], rings: [[2, 6], [3, 14], [4, 26]], minOpacity: 0.1, lite: { rings: [[4, 16]], minOpacity: 0.25, keep: '45%' } },
    lite: '/assets/splats/sala-thai-lite.sog', // a light copy (2 MB), shown first while the full one loads
    view: '/assets/splats/sala-view.webp', // tools/portal-view.mjs: the place, through the planet's door
    back: '/assets/splats/sala-back.webp', // tools/portal-view.mjs --back: the planet, through the door back
    credit: { by: 'Andrew.HD', source: 'https://superspl.at/scene/34ac01fc', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' },
    sky: 0xcfdde6, // the haze at the horizon (and the door's opening before its panorama's in)
    zenith: 0x8db4d8, // the sky overhead
    lawn: 0x8c9a74, // far ground, going into the haze, past where the scan ends
    // in the scan's own coordinates (y points down, as captures do)
    at: [53.5, -1.3, 19.7], // where you come in: on the paving east of the pavilion, at ground height
    face: [46.7, 19.7], // the way you face: the pavilion
    roam: 7.5, // metres you can walk from where you came in
    keepOut: [[46.7, 19.7, 4.2]], // the pavilion and its steps: x, z, radius
  },
};
