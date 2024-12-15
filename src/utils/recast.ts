// ======================================================================
//
//   GNU GENERAL PUBLIC LICENSE
//   Version 3, 29 June 2007
//   copyright (C) 2020 - 2021 Quentin Gruber
//   copyright (C) 2021 - 2024 H1emu community
//
//   https://github.com/QuentinGruber/h1z1-server
//   https://www.npmjs.com/package/h1z1-server
//
//   Based on https://github.com/psemu/soe-network
// ======================================================================

import { readFileSync, writeFileSync } from "node:fs";
import {
  CrowdAgent,
  init as initRecast,
  NavMesh,
  statusToReadableString,
  Vector3
} from "recast-navigation";
import { NavMeshQuery } from "recast-navigation";
import { importNavMesh } from "recast-navigation";
import { Crowd } from "recast-navigation";

export class NavManager {
  navmesh!: NavMesh;
  crowd!: Crowd;
  navMeshQuery!: NavMeshQuery;
  lastTimeCall: number = Date.now();
  constructor() {}
  async loadNav() {
    const navData = new Uint8Array(
      readFileSync(__dirname + "/../../data/2016/navData/z1.bin")
    );
    await initRecast();
    const { navMesh } = importNavMesh(navData);
    this.navmesh = navMesh;
    const maxAgents = 100;
    const maxAgentRadius = 0.6;

    this.navMeshQuery = new NavMeshQuery(this.navmesh);
    this.crowd = new Crowd(navMesh, { maxAgents, maxAgentRadius });
    setInterval(() => {
      this.updt();
    }, 250);
  }
  // Convert Blender coordinates to Game coordinates
  static blenderToGame(f: Float32Array): Float32Array {
    return new Float32Array([
      f[0] * 2, // Blender X → Game X (scaled)
      f[1] * 2, // Blender Y → Game Z (inverted)
      f[2] * 2 // Blender Z → Game Y (scaled)
    ]);
  }

  // Convert Game coordinates to Blender coordinates
  static gameToBlender(f: Float32Array): Float32Array {
    return new Float32Array([
      f[0] / 2, // Game X → Blender X
      f[1] / 2, // Game Y → Blender Z (scaled)
      f[2] / 2 // Game Z → Blender Y (scaled and inverted)
    ]);
  }

  static Float32ToVec3(f: Float32Array): Vector3 {
    return { x: f[0], y: f[1], z: f[2] };
  }
  static Vec3ToFloat32(v: Vector3): Float32Array {
    return new Float32Array([v.x, v.y, v.z]);
  }
  updt() {
    const dt = 1 / 60;
    const maxSubSteps = 10;

    const timeSinceLastFrame = Date.now() - this.lastTimeCall;

    this.crowd.update(dt, timeSinceLastFrame, maxSubSteps);
    this.lastTimeCall = Date.now();
  }
  getClosestNavPoint(pos: Float32Array): Vector3 {
    const n = this.navMeshQuery.findNearestPoly(NavManager.Float32ToVec3(pos));
    return n.nearestPoint;
  }
  createAgent(pos: Float32Array): CrowdAgent | null {
    pos = NavManager.gameToBlender(pos);
    const position = this.getClosestNavPoint(pos);
    const radius = 5.5;

    const {
      randomPoint: initialAgentPosition,
      success,
      status
    } = this.navMeshQuery.findRandomPointAroundCircle(position, radius);

    if (!success) {
      console.log(statusToReadableString(status));
      return null;
    }

    const agent = this.crowd.addAgent(initialAgentPosition, {
      radius: 1,
      height: 4,
      maxAcceleration: 8.0,
      maxSpeed: 2.0,
      collisionQueryRange: 0.1,
      pathOptimizationRange: 0.0,
      separationWeight: 0
    });
    return agent;
  }
  testNavMesh(a: Float32Array, b: Float32Array): Float32Array[] {
    console.time("calculating path");

    const start = NavManager.Float32ToVec3(a);
    const end = NavManager.Float32ToVec3(b);
    const { success, error, path } = this.navMeshQuery.computePath(start, end);
    console.log(success);
    console.log(error);
    console.log(path);
    console.timeEnd("calculating path");
    const pathNodes: Float32Array[] = [];
    if (path) {
      path.forEach((v) => {
        pathNodes.push(new Float32Array([v.x, v.y, v.z]));
      });
    }
    return pathNodes;
  }
}
