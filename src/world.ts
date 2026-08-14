/* Procedural world route: 12 sectors in 4 layers, edges open as sectors clear. */
import { S } from './state';
import { mulberry32 } from './utils';

export function genWorld(): void {
  var r = mulberry32((S.seed ^ 0x9e3779b9) >>> 0);
  var layers = [[0, 1], [2, 3, 4], [5, 6, 7, 8], [9, 10, 11]];
  S.worldNodes = [];
  S.worldEdges = [];
  for (var li = 0; li < layers.length; li++) {
    var L = layers[li];
    for (var k = 0; k < L.length; k++) {
      S.worldNodes.push({
        idx: L[k],
        layer: li,
        x: (.09 + li * .27) + (r() - .5) * .05,
        y: (k + 1) / (L.length + 1) + (r() - .5) * .08
      });
    }
  }
  for (li = 0; li < layers.length - 1; li++) {
    var A = layers[li], B = layers[li + 1], indeg: Record<number, number> = {};
    for (var a = 0; a < A.length; a++) {
      var k2 = 1 + (r() < .55 ? 1 : 0);
      for (k2; k2 > 0; k2--) {
        var b = Math.floor(r() * B.length);
        if (!S.worldEdges.some(function (e) { return e[0] === A[a] && e[1] === B[b]; })) {
          S.worldEdges.push([A[a], B[b]]);
          indeg[B[b]] = 1;
        }
      }
    }
    for (var b2 = 0; b2 < B.length; b2++) {
      if (!indeg[B[b2]]) {
        S.worldEdges.push([A[Math.floor(r() * A.length)], B[b2]]);
      }
    }
  }
}

export function nodeOpen(i: number): boolean {
  if (S.worldNodes[i].layer === 0) return true;
  for (var e = 0; e < S.worldEdges.length; e++) {
    if (S.worldEdges[e][1] === i && S.cleared[S.worldEdges[e][0]]) return true;
  }
  return false;
}
