//
//   GNU GENERAL PUBLIC LICENSE
//   Version 3, 29 June 2007
//   copyright (C) 2020 - 2021 Quentin Gruber
//   copyright (C) 2021 - 2023 H1emu community
//
//   https://github.com/QuentinGruber/h1z1-server
//   https://www.npmjs.com/package/h1z1-server
//
//   Based on https://github.com/psemu/soe-network
// ======================================================================

import { ZoneServer2016 } from "../zoneserver";
import { Items, ResourceIds, ResourceTypes } from "../models/enums";
import { LootableConstructionEntity } from "../entities/lootableconstructionentity";
import { ConstructionDoor } from "../entities/constructiondoor";
import { ConstructionChildEntity } from "../entities/constructionchildentity";
import { getDistance } from "../../../utils/utils";
import { ConstructionParentEntity } from "../entities/constructionparententity";
import { Vehicle2016 } from "../entities/vehicle";
import { dailyRepairMaterial } from "types/zoneserver";
import { BaseItem } from "../classes/baseItem";

export class DecayManager {
  /** Used for tracking the tick amount needed before decay damage occurs on the construction */
  constructionDamageTickCount = 0;

  /** Used for tracking the tick amount needed before decay damage occurs on the vehicle */
  vehicleDamageTickCount = 0; // used to run vehicle damaging once every x loops

  /** Timer used for determining the interval for decay ticks */
  runTimer?: NodeJS.Timeout;

  /** MANAGED BY CONFIGMANAGER - See defaultConfig.yaml for more information */
  decayTickInterval!: number;
  constructionDamageTicks!: number;
  ticksToFullDecay!: number;
  worldFreeplaceDecayMultiplier!: number;
  vehicleDamageTicks!: number;
  vacantFoundationTicks!: number;
  griefFoundationTimer!: number;
  griefCheckSlotAmount!: number;
  baseVehicleDamage!: number;
  maxVehiclesPerArea!: number;
  vehicleDamageRange!: number;
  dailyRepairMaterials!: dailyRepairMaterial[];

  public clearTimers() {
    if (this.runTimer) clearTimeout(this.runTimer);
  }

  public run(server: ZoneServer2016) {
    this.contructionExpirationCheck(server);
    if (this.constructionDamageTickCount >= this.constructionDamageTicks) {
      this.contructionDecayDamage(server);
      this.constructionDamageTickCount = -1;
    }
    this.constructionDamageTickCount++;

    if (this.vehicleDamageTickCount >= this.vehicleDamageTicks) {
      this.vehicleDecayDamage(server);
      this.vehicleDamageTickCount = -1;
    }
    this.vehicleDamageTickCount++;

    this.runTimer = setTimeout(() => {
      this.run(server);
    }, this.decayTickInterval);
  }

  private contructionExpirationCheck(server: ZoneServer2016) {
    let destroyedGriefFoundations = 0;
    for (const a in server._entities._constructionFoundations) {
      const foundation = server._entities._constructionFoundations[a];
      if (
        foundation.itemDefinitionId == Items.FOUNDATION ||
        foundation.itemDefinitionId == Items.GROUND_TAMPER
      ) {
        if (
          Date.now() - foundation.placementTime >=
          this.griefFoundationTimer * 3600000
        ) {
          if (
            Object.keys(foundation.occupiedWallSlots).length <
              this.griefCheckSlotAmount &&
            Object.keys(foundation.occupiedShelterSlots).length == 0 &&
            Object.keys(foundation.occupiedExpansionSlots).length == 0
          ) {
            for (const a in foundation.occupiedWallSlots) {
              foundation.occupiedWallSlots[a].destroy(server);
            }
            // clear floating entities
            for (const a in foundation.freeplaceEntities) {
              foundation.freeplaceEntities[a].destroy(server);
            }
            foundation.destroy(server);
            destroyedGriefFoundations++;
          }
        }
      }

      if (
        foundation.itemDefinitionId != Items.FOUNDATION &&
        foundation.itemDefinitionId != Items.GROUND_TAMPER
      ) {
        continue;
      }
      let expansionsEmpty = true;
      Object.values(foundation.occupiedExpansionSlots).forEach(
        (exp: ConstructionParentEntity) => {
          if (
            Object.keys(exp.occupiedWallSlots).length != 0 ||
            Object.keys(exp.occupiedShelterSlots).length != 0 ||
            Object.keys(exp.occupiedUpperWallSlots).length != 0
          ) {
            expansionsEmpty = false;
          }
        }
      );
      if (!expansionsEmpty) continue;
      if (
        Object.keys(foundation.occupiedWallSlots).length == 0 &&
        Object.keys(foundation.occupiedShelterSlots).length == 0 &&
        Object.keys(foundation.occupiedUpperWallSlots).length == 0
      ) {
        if (foundation.ticksWithoutObjects >= this.vacantFoundationTicks) {
          for (const a in foundation.occupiedExpansionSlots) {
            const expansion = foundation.occupiedExpansionSlots[a];
            for (const a in expansion.occupiedRampSlots) {
              expansion.occupiedRampSlots[a].destroy(server);
            }
            // clear floating shelters / other entities on expansion
            for (const a in expansion.freeplaceEntities) {
              expansion.freeplaceEntities[a].destroy(server);
            }
            expansion.destroy(server);
          }
          for (const a in foundation.occupiedRampSlots) {
            foundation.occupiedRampSlots[a].destroy(server);
          }
          // clear floating shelters / other entities
          for (const a in foundation.freeplaceEntities) {
            foundation.freeplaceEntities[a].destroy(server);
          }
          Object.values(foundation.freeplaceEntities).forEach(
            (
              entity:
                | LootableConstructionEntity
                | ConstructionDoor
                | ConstructionChildEntity
            ) => {
              entity.destroy(server);
            }
          );
          foundation.destroy(server);
        }
        foundation.ticksWithoutObjects++;
      } else {
        foundation.ticksWithoutObjects = 0;
      }
    }
    if (destroyedGriefFoundations > 0) {
      console.log(`Destroyed ${destroyedGriefFoundations} grief foundations`);
    }
  }

  private decayDamage(
    server: ZoneServer2016,
    entity:
      | LootableConstructionEntity
      | ConstructionDoor
      | ConstructionChildEntity,
    freeplaceDecayMultiplier: number = 1
  ) {
    if (entity.isDecayProtected) {
      entity.isDecayProtected = false;
      return;
    }

    entity.damage(server, {
      entity: "Server.DecayManager",
      damage:
        entity.maxHealth / (this.ticksToFullDecay / freeplaceDecayMultiplier)
    });
  }

  // uses repair box if one is detected on the base and it has the required materials
  useRepairBox(server: ZoneServer2016, foundation: ConstructionParentEntity) {
    for (const b in foundation.freeplaceEntities) {
      const freePlace = foundation.freeplaceEntities[b];
      if (
        freePlace.itemDefinitionId != Items.REPAIR_BOX ||
        !(freePlace instanceof LootableConstructionEntity)
      ) {
        continue;
      }

      const container = freePlace.getContainer();
      if (!container) continue;
      let hasMaterials = true;
      const itemsToRemove: { item: BaseItem; count: number }[] = [];
      this.dailyRepairMaterials.forEach((material: dailyRepairMaterial) => {
        let materialPresent = false;
        for (const c in container.items) {
          const item = container.items[c];
          if (
            item.itemDefinitionId == material.itemDefinitionId &&
            item.stackCount >= material.requiredCount
          ) {
            materialPresent = true;
            itemsToRemove.push({
              item: item,
              count: material.requiredCount
            });
          }
        }
        if (!materialPresent) hasMaterials = false;
      });

      if (!hasMaterials) continue;

      itemsToRemove.forEach(
        (itemToRemove: { item: BaseItem; count: number }) => {
          server.removeContainerItem(
            freePlace,
            itemToRemove.item,
            container,
            itemToRemove.count
          );
        }
      );
      server.constructionManager.fullyRepairFoundation(server, foundation);
      return;
    }
  }

  contructionDecayDamage(server: ZoneServer2016) {
    for (const a in server._entities._constructionFoundations) {
      const foundation = server._entities._constructionFoundations[a];

      this.useRepairBox(server, foundation);

      if (
        foundation.itemDefinitionId != Items.FOUNDATION &&
        foundation.itemDefinitionId != Items.GROUND_TAMPER &&
        foundation.itemDefinitionId != Items.FOUNDATION_EXPANSION
      ) {
        this.decayDamage(server, foundation);
      }
    }

    for (const a in server._entities._worldLootableConstruction) {
      this.decayDamage(
        server,
        server._entities._worldLootableConstruction[a],
        this.worldFreeplaceDecayMultiplier
      );
    }
    for (const a in server._entities._worldSimpleConstruction) {
      this.decayDamage(
        server,
        server._entities._worldSimpleConstruction[a],
        this.worldFreeplaceDecayMultiplier
      );
    }
    for (const a in server._entities._constructionSimple) {
      const simple = server._entities._constructionSimple[a];
      if (
        simple.itemDefinitionId == Items.FOUNDATION_RAMP ||
        simple.itemDefinitionId == Items.FOUNDATION_STAIRS
      ) {
        continue;
      }
      this.decayDamage(server, server._entities._constructionSimple[a]);
    }
    for (const a in server._entities._lootableConstruction) {
      this.decayDamage(server, server._entities._lootableConstruction[a]);
    }
    for (const a in server._entities._constructionDoors) {
      const door = server._entities._constructionDoors[a];
      this.decayDamage(server, door);
    }
  }

  private getCloseVehicles(server: ZoneServer2016, vehicle: Vehicle2016) {
    const vehicles: Array<string> = [];
    for (const characterId in server._entities._vehicles) {
      const v = server._entities._vehicles[characterId];
      if (!vehicle) continue;
      if (
        getDistance(vehicle.state.position, v.state.position) <=
        this.vehicleDamageRange
      ) {
        vehicles.push(v.characterId);
      }
    }
    return vehicles;
  }

  public vehicleDecayDamage(server: ZoneServer2016) {
    for (const characterId in server._entities._vehicles) {
      const vehicle = server._entities._vehicles[characterId];
      if (!vehicle) continue;
      const closeVehicles = this.getCloseVehicles(server, vehicle);
      let damage = this.baseVehicleDamage;
      if (closeVehicles.length > this.maxVehiclesPerArea) {
        damage *= closeVehicles.length - this.maxVehiclesPerArea + 1;
      }
      vehicle.damage(server, {
        entity: "Server.DecayManager",
        damage: damage
      });
      server.updateResourceToAllWithSpawnedEntity(
        vehicle.characterId,
        vehicle._resources[ResourceIds.CONDITION],
        ResourceIds.CONDITION,
        ResourceTypes.CONDITION,
        server._entities._vehicles
      );
      if (vehicle.getHealth() > 0) continue;
      vehicle.destroy(server);
    }
  }

  /*private decayChildEntity(
    server: ZoneServer2016,
    entity: ConstructionChildEntity | ConstructionDoor
  ) {
    if (entity instanceof ConstructionChildEntity) {
      Object.values(entity.occupiedShelterSlots).forEach(
        (slot: ConstructionChildEntity) => {
          this.decayChildEntity(server, slot);
        }
      );
      Object.values(entity.occupiedWallSlots).forEach(
        (wall: ConstructionDoor | ConstructionChildEntity) => {
          this.decayDamage(server, wall);
        }
      );
      Object.values(entity.occupiedUpperWallSlots).forEach(
        (slot: ConstructionDoor | ConstructionChildEntity) => {
          this.decayDamage(server, slot);
        }
      );
    }
    this.decayDamage(server, entity);
  }*/
}
