import * as T from "three";
import { BAY } from "./garage-architecture";

/** Ground-level wear and wayfinding. No collision or gameplay state. */
export class WorkshopDressing {
  readonly root = new T.Group();
  private textures: T.Texture[] = [];
  constructor() {
    this.root.name = "Workshop_Surface_Detail";
    for (let bay = 0; bay < 3; bay++) {
      const c = document.createElement("canvas");
      c.width = c.height = 1024;
      const ctx = c.getContext("2d")!;
      let seed = 42 + bay * 127;
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        return (seed >>> 0) / 4294967296;
      };
      // Scuffs run with the wheels, stopping before the customer walkway.
      for (const x of [370, 654]) {
        for (let i = 0; i < 95; i++) {
          ctx.strokeStyle = `rgba(42,38,31,${0.012 + random() * 0.028})`;
          ctx.lineWidth = 1 + random() * 3;
          const xx = x + (random() - 0.5) * 31,
            yy = random() * 920;
          ctx.beginPath();
          ctx.moveTo(xx, yy);
          ctx.lineTo(xx + (random() - 0.5) * 4, yy + 22 + random() * 100);
          ctx.stroke();
        }
      }
      for (let i = 0; i < 35; i++) {
        const x = 180 + random() * 680,
          y = 120 + random() * 780,
          radius = 7 + random() * 32;
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
        g.addColorStop(0, `rgba(66,53,35,${0.025 + random() * 0.045})`);
        g.addColorStop(1, "rgba(66,53,35,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
      // Surface joints and a few fine cracks, away from the active markers.
      ctx.strokeStyle = "rgba(67,62,49,.13)";
      ctx.lineWidth = 0.7;
      for (let i = 0; i < 9; i++) {
        let x = random() * 1024,
          y = random() * 1024;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let j = 0; j < 5; j++) {
          x += random() * 14 - 7;
          y += 4 + random() * 9;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(55,66,65,.48)";
      ctx.font = '800 76px "Barlow Condensed", sans-serif';
      ctx.fillText(`0${bay + 1}`, 84, 160);
      ctx.font = '600 18px "Barlow Condensed", sans-serif';
      ctx.fillText(["SERVICE", "TEAM GARAGE", "PERFORMANCE"][bay], 86, 190);
      ctx.fillRect(85, 209, 96, 3);
      const texture = new T.CanvasTexture(c);
      texture.colorSpace = T.SRGBColorSpace;
      texture.anisotropy = 8;
      this.textures.push(texture);
      const material = new T.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        toneMapped: false,
      });
      const mesh = new T.Mesh(
        new T.PlaneGeometry(BAY.width, BAY.depth),
        material,
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(BAY.width * (bay + 0.5), 0.023, BAY.depth / 2);
      this.root.add(mesh);
    }
  }
  dispose() {
    for (const child of this.root.children) {
      const mesh = child as T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial>;
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.textures.forEach((t) => t.dispose());
    this.root.removeFromParent();
  }
}
