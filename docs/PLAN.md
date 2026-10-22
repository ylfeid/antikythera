# plan and data model

this is the design note the project was built from , kept up to date w the code

## order of work

1. sources; verify every citation (DOIs against crossref) and take every tooth count, train and dimension from the papers. sources: Freeth et al. 2006 and 2008 for the surviving gearing, Freeth et al. 2021 (main text, Fig. 3, Supplementary Discussion S4, Tables S8 and S9) for the front, Freeth 2014 for the Saros glyphs and epoch, and Edmunds 2011 and Szigety & Arenas 2025 for manufacturing accuracy.
2. exact kinematics with tests; A gear graph solved over the rationals, plus angle evaluation that stays exact as time grows.
3. ephemeris comparison with tests; Calibration, error series, a decomposition into theory and period-relation errors, eclipse scoring, and the Monte Carlo.
4. 3D rendering and interaction on top of the tested model.
5. README and figures generated from the same code (`npm run accuracy`)

## data model

```
gear      id, teeth, status (surviving | reconstructed), confidence (required | modelled | speculative),
          train, frame (main | b1 | e3 | b3), fragment, measured radii (Table S8), role, evidence, sources
edge      mesh    a, b, frame        Na·(ωa − ωF) + Nb·(ωb − ωF) = 0
          arbor   a, b               ωa = ωb
          fixed   a                  ωa = 0
          pinSlot a, b, frame, offset, pin, dir
                                     equal mean rates in F; angle β = atan2(r·sin α − e·sin d, r·cos α − e·cos d)
follower  slotted arm on the centre following a pin on an epicyclic gear (inferior planets, true Sun);
          an output, not a node
train     output gear, human-readable path, relation read off the solved rates
```

`src/model/gears.ts` holds the catalogue (69 gears) and the edges. `src/model/kinematics.ts` builds the linear system and solves it with exact Gauss–Jordan elimination on BigInt fractions. It then orders the edges into a schedule, so each gear's angle follows from a gear already known and the frame its edge needs.

### angles

```
θ_g(T) = frac(ω_g · T) + f_g
```

`ω_g · T` is an exact rational (T is years since the epoch, itself the exact quotient of days by 1461/4). It is reduced mod 1 in BigInt before becoming a float. `f_g` is small and bounded: assembly phases, pin-and-slot anomalies and, in the Monte Carlo, tooth errors. It is propagated down the schedule:

- mesh: `f_b − f_F = −(Na/Nb)·(f_a − f_F) + phase_b (+ tooth error)`
- arbor: `f_b = f_a + phase_b`
- pin-and-slot: `f_b = f_a + (β − α) + phase_b`

### frames

- `b1` carries the Strap and the Circular Plate, so it carries every front epicyclic gear.
- `e3` carries k1 and k2.
- `b3`, the Moon pointer, carries the phase-ball contrate gear.

### from gears to the sky (`src/model/mechanism.ts`)

- Sun: the stationary 56's pin gives a fixed vector towards the apogee (Hipparchus: e = 1/24, apogee 65.5°), added to the mean Sun.
- Moon: b3 directly.
- Inferior planets: follower angle of (spoke vector of length i) + (pin vector of length d) (Table S9).
- Superior planets: the output gear g7.
- Nodes: the Dragon Hand.

------> calibration fits only what a maker would set (`src/analysis/calibrate.ts`): one pointer angle per output and one anomaly phase per pin-and-slot, from 19 years of ephemeris around the epoch.

### the ideal mechanism

`idealRates()` replaces each period relation with the modern mean motion and uses the tropical year for b1. Running the same geometry with these rates separates the error of the Greek theories from the error of the gear ratios.

## layout (`src/model/layout.ts`)

Axes are placed so that every mesh is exactly one sum of pitch radii (checked by a test). radii come from the measured values for surviving gears and module 0.48–0.5 for reconstructed ones; the nodes train uses the 0.486/0.482 modules given in the paper. The back dials sit on the n (Metonic) and g (Saros) arbors. the front layers follow the 15.0 mm and 9.7 mm spaces given by Freeth et al. 2021. This is a dimensionally consistent schematic, not a survey of the fragments.

## rendering

- raw WebGPU, matching the sister projects: one lit WGSL shader, an opaque and a blended pipeline, 4× MSAA, and mipmapped Canvas 2D textures for dial faces.
- gears are generated with triangular teeth (tip, root, tip, …), with rims, four spokes and hubs on the larger wheels.
- exploded view scales z, X-ray fades faces by their angle to the eye, and slicing discards fragments beyond a plane.
- picking ray-casts against gear discs.
- teeth are drawn interleaved at each mesh by a constant per-gear drawing offset, which never touches the kinematics.
