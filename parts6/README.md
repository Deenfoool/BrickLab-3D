# PARTS-6 — Realism pass

PARTS-6 is a visual-only fidelity layer on top of PARTS-5. It deliberately keeps existing connector positions, drivetrain semantics, wheel/gear metrics and authoritative physics ownership intact.

## Goals

- molded Technic-like silhouettes instead of generic primitive geometry;
- waisted liftarms with true bores and subtle molded edge treatment;
- hollow Technic bricks with reinforced side-hole bosses and believable underside structure;
- rounded cross axles, molded pins, bushes and couplers;
- involute-like spur tooth rings with separate hubs and molded radial webs;
- conical bevel gears with tapered teeth;
- family-specific tyre carcasses, tread and recessed rims;
- steering/suspension parts whose visible ports match their connector semantics;
- ABS / POM / rubber / metal material separation without excessive gloss.

## Non-goals

- no connector migrations;
- no physics hacks or force/velocity clamps;
- no decorative meshes controlling collider dimensions;
- no fake gear joints;
- no new catalog flood before existing parts reach the desired quality.

## Visual review

Open `tests/parts5-visual-qa.html` in a WebGL-capable browser. The page is retitled **PARTS-6 REALISM QA** and loads every PARTS-6 visual owner before creating the gallery objects.

Review especially:

1. wheel sidewall + rim depth and family-specific tread;
2. 8T–40T spur family consistency and open molded webs;
3. 12T/20T bevel pair;
4. straight/thin/bent liftarms and 5×7 frame;
5. Technic brick side bores and underside;
6. axles, pins, bushes and axle coupler;
7. steering base, knuckle, wheel hub and tie rod;
8. shock body/rod and metal coil spring;
9. universal/CV joints;
10. connector-port fidelity and absence of z-fighting.
