// Apps Script scheduling module. No credentials or registration data belong here.
// Nearby means 1–3 positions apart; prefer a gap of 3 where other requests permit.
function normalizePairKey_(s) {
  return String(s || '').trim().replace(/\s+/g, '')
    .replace(/[／/，,、．。()（）\-_.]/g, '').toLowerCase();
}

function compareProgramByTime_(a, b) {
  return (a.createdAt - b.createdAt) || ((a.rowIndex || 0) - (b.rowIndex || 0));
}

function resolveNearbyRequests_(entries) {
  var links = [], unresolved = [], ranges = [];
  entries.forEach(function(entry, from) {
    var raw = String(entry.preferredWith || '').trim();
    if (!raw) return;
    function candidates(text) {
      var key = normalizePairKey_(text), matches = [];
      if (!key) return matches;
      entries.forEach(function(other, to) {
        if (from === to) return;
        var keys = (other.matchKeys || []).concat([
          other.performerDisplay, other.name, other.groupName
        ], other.performerNames || []);
        if (keys.some(function(k) { return normalizePairKey_(k) === key; })) matches.push(to);
      });
      return matches;
    }
    // Resolve a selected full group display before splitting a multi-person request.
    var exact = candidates(raw);
    var range = raw.match(/第\s*(\d+)\s*組?\s*[~～\-至到]\s*第?\s*(\d+)\s*組/);
    if (!exact.length && range && Number(range[1]) >= 1 && Number(range[2]) >= Number(range[1])) {
      ranges.push({from:from, min:Number(range[1]), max:Number(range[2])});
      return;
    }
    var parts = exact.length ? [raw] : raw.split(/[、，,；;\n／/]+/).filter(function(s) { return s.trim(); });
    var seen = {};
    parts.forEach(function(part) {
      var found = candidates(part);
      if (found.length !== 1) {
        unresolved.push({from:from, text:part.trim(), reason:found.length ? '同名對象不只一組，需人工確認' : '找不到同場次對象；若為時間或順位備註，需人工安排'});
        return;
      }
      if (!seen[found[0]]) {
        seen[found[0]] = true;
        links.push({from:from, to:found[0]});
      }
    });
  });
  return {links:links, unresolved:unresolved, ranges:ranges};
}

function sortProgramSection_(list) {
  // Work on copies: do not modify stored registrations or rely on their previous order.
  var entries = (list || []).map(function(it) { return Object.assign({}, it); }).sort(compareProgramByTime_);
  var n = entries.length;
  if (!n) return [];
  var resolved = resolveNearbyRequests_(entries), links = resolved.links;
  var rankRanges = {};
  resolved.ranges.forEach(function(r) { rankRanges[r.from] = r; });
  var front = [], mid = [], back = [];
  entries.forEach(function(it, i) {
    if (it.front && !it.back) front.push(i);
    else if (it.back && !it.front) back.push(i);
    else mid.push(i);
  });
  var order = front.concat(mid, back), baseline = [];
  order.forEach(function(id, i) { baseline[id] = i; });

  // Components can move together without undoing already satisfied nearby requests.
  var parent = entries.map(function(_, i) { return i; });
  function root(i) { while (parent[i] !== i) i = parent[i]; return i; }
  links.forEach(function(l) { parent[root(l.from)] = root(l.to); });
  var components = {};
  entries.forEach(function(_, i) { var r = root(i); (components[r] || (components[r] = [])).push(i); });

  function score(arr) {
    var pos = [], out = [], outside = 0, gap = 0, streak = 0, previous = '', repeats = 0, movement = 0;
    arr.forEach(function(id, i) { pos[id] = i; });
    // Lexicographic priority: earlier nearby requests, earlier front/back requests,
    // distance outside requested zones, gap preference, variety, minimum movement.
    links.forEach(function(l) {
      var d = Math.abs(pos[l.from] - pos[l.to]);
      out.push(Math.max(0, d - 3));
      gap += Math.abs(d - 3);
    });
    entries.forEach(function(it, id) {
      var range = rankRanges[id];
      if (range) {
        var rd = Math.max(0, range.min - 1 - pos[id], pos[id] + 1 - range.max);
        out.push(rd > 0 ? 1 : 0);
        outside += rd;
      }
      if (!!it.front === !!it.back) return;
      var d = it.front ? Math.max(0, pos[id] - 9) : Math.max(0, n - 10 - pos[id]);
      out.push(d > 0 ? 1 : 0);
      outside += d;
    });
    arr.forEach(function(id, i) {
      var type = entries[id].type || '';
      streak = type && type === previous ? streak + 1 : 1;
      previous = type;
      if (streak > 3) repeats++;
      movement += Math.abs(i - baseline[id]);
    });
    return out.concat([outside, gap, repeats, movement]);
  }
  function better(a, b) {
    for (var k = 0; k < a.length; k++) { if (a[k] !== b[k]) return a[k] < b[k]; }
    return false;
  }
  var currentScore = score(order);
  // Strict improvement prevents oscillation and starvation. Bound runtime on Apps Script.
  for (var round = 0; round < Math.max(20, n * 2); round++) {
    var best = order, bestScore = currentScore;
    function consider(candidate) {
      var value = score(candidate);
      if (better(value, bestScore)) { best = candidate; bestScore = value; }
    }
    for (var from = 0; from < n; from++) {
      for (var to = 0; to < n; to++) {
        if (from === to) continue;
        var moved = order.slice(), item = moved.splice(from, 1)[0];
        moved.splice(to, 0, item); // 'to' is the final position, after removal.
        consider(moved);
        if (to > from) {
          var swapped = order.slice();
          swapped[from] = order[to]; swapped[to] = order[from];
          consider(swapped);
        }
      }
    }
    Object.keys(components).forEach(function(key) {
      var members = components[key];
      if (members.length < 2 || members.length === n) return;
      var group = order.filter(function(id) { return members.indexOf(id) >= 0; });
      var rest = order.filter(function(id) { return members.indexOf(id) < 0; });
      for (var at = 0; at <= rest.length; at++) consider(rest.slice(0, at).concat(group, rest.slice(at)));
    });
    if (best === order) break;
    order = best; currentScore = bestScore;
  }

  var positions = [], frontCount = front.length, backCount = back.length;
  order.forEach(function(id, i) { positions[id] = i; });
  entries.forEach(function(it, id) {
    it.scheduleWarnings = [];
    it.nearbyAssignments = [];
    var range = rankRanges[id];
    if (range) {
      var inRange = positions[id] + 1 >= range.min && positions[id] + 1 <= range.max;
      it.rankPreference = {min:range.min, max:range.max, satisfied:inRange};
      if (!inRange) it.scheduleWarnings.push('希望第 ' + range.min + '～' + range.max + ' 組，因需求衝突未能安排，需人工確認');
    }
    if (it.front && !it.back && positions[id] >= 10) {
      it.scheduleWarnings.push(frontCount > 10 ? '靠前需求共 ' + frontCount + ' 組，超過 10 組；依報名先後及附近需求安排' : '附近需求優先，本組未排入前 10 組');
    }
    if (it.back && !it.front && positions[id] < n - 10) {
      it.scheduleWarnings.push(backCount > 10 ? '靠後需求共 ' + backCount + ' 組，超過 10 組；依報名先後及附近需求安排' : '附近需求優先，本組未排入後 10 組');
    }
  });
  resolved.unresolved.forEach(function(u) { entries[u.from].scheduleWarnings.push('「' + u.text + '」：' + u.reason); });
  links.forEach(function(l) {
    var target = entries[l.to], distance = Math.abs(positions[l.from] - positions[l.to]);
    var name = target.performerDisplay || target.name || target.groupName || '未命名';
    entries[l.from].nearbyAssignments.push({name:name, order:positions[l.to]+1, distance:distance, satisfied:distance <= 3});
    if (distance > 3) entries[l.from].scheduleWarnings.push('與「' + name + '」相差 ' + distance + ' 位；附近需求衝突，需人工確認');
  });
  return order.map(function(id) { return entries[id]; });
}

if (typeof module !== 'undefined') module.exports = {sortProgramSection_:sortProgramSection_, resolveNearbyRequests_:resolveNearbyRequests_, normalizePairKey_:normalizePairKey_};
