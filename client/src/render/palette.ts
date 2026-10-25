import * as THREE from 'three';

/** the whole cozy look lives here: warm, slightly desaturated, golden hour */
export const PAL = {
  skyTop: '#8fc4e8', skyMid: '#f8e1b8', skyLow: '#ffd1a1',
  fog: '#f5d9b4',
  grassA: '#8fc46a', grassB: '#7bb55f', grassDry: '#b6c76d',
  path: '#d9b98a', pathEdge: '#c7a272',
  sun: '#ffd9a0', hemiSky: '#bcd8ff', hemiGround: '#e8c9a0',
  team: [new THREE.Color('#4a94d9'), new THREE.Color('#ee7f9b')] as const,
  enemy: new THREE.Color('#8a4a64'),
  skin: ['#f6d2b0', '#e8b890', '#c68c63', '#f1c6a3'],
  iron: '#a9b2bd', wood: '#a6743f', gold: '#f2c14e', cloth: '#f4ead2', leather: '#8a5a36',
};
