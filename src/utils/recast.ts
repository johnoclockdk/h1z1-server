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
import { ZoneServer2016 } from "servers/ZoneServer2016/zoneserver";

export class NavManager {
  navmesh!: NavMesh;
  crowd!: Crowd;
  navMeshQuery!: NavMeshQuery;
  lastTimeCall: number = Date.now();
  refreshRateMs: number = 200;
  constructor(public server: ZoneServer2016) {}
  async loadNav() {
    const navData = new Uint8Array(
      readFileSync(__dirname + "/../../data/2016/navData/z1.bin")
    );
    await initRecast();
    const { navMesh } = importNavMesh(navData);
    this.navmesh = navMesh;
    const maxAgents = 1000;
    const maxAgentRadius = 1;

    this.navMeshQuery = new NavMeshQuery(this.navmesh);
    this.crowd = new Crowd(navMesh, { maxAgents, maxAgentRadius });
  }
  start() {
    setInterval(() => {
      console.time("nav");
      this.updtCrowd();
      this.updtCrowdPosition();
      console.timeEnd("nav");
    }, this.refreshRateMs);
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
  updtCrowdPosition() {
    Object.values(this.server._npcs).forEach((npc) => {
      if (npc.navAgent) {
        console.log(npc.navAgent.interpolatedPosition);
        npc.goTo(
          NavManager.blenderToGame(
            NavManager.Vec3ToFloat32(npc.navAgent.interpolatedPosition)
          )
        );
      }
    });
  }
  updtCrowd() {
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
    const radius = 0.5;

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
      radius: 0.5,
      height: 10,
      maxAcceleration: 20.0,
      maxSpeed: 6.0,
      collisionQueryRange: 0.1,
      pathOptimizationRange: 0.0,
      separationWeight: 0
    });
    return agent;
  }
}
