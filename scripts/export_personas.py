"""Sample 5,000 adult synthetic Finns from Statistics Finland marginals.

Inputs (all public):
  data/eemil/data/cache_phase2/*.csv   StatFin marginals by municipality (Eemil's cache)
  data/eemil/data/dvv_names/*.xlsx     DVV first/last name frequencies
  data/raw/kunta.json                  Statistics Finland WFS kunta4500k_2024 (WGS84)
  data/raw/maakunta.json               Statistics Finland WFS maakunta4500k_2024 (WGS84)
  data/raw/kunta_maakunta.json         StatFin classification key kunta 2024 -> maakunta 2024

Outputs:
  public/data/personas.json, public/data/regions.geojson, public/data/region_centroids.json

Caveat: attributes are drawn from per-municipality marginals (independence assumption),
with simple age-consistency rules for activity and education.

Run: python3 -I scripts/export_personas.py
"""
import json
import os
import random
from collections import Counter, defaultdict

import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CACHE = os.path.join(ROOT, "data/eemil/data/cache_phase2")
NAMES = os.path.join(ROOT, "data/eemil/data/dvv_names")
RAW = os.path.join(ROOT, "data/raw")
OUT = os.path.join(ROOT, "public/data")
N = 5000
SEED = 20241030
rng = random.Random(SEED)


def load(name, col):
    df = pd.read_csv(os.path.join(CACHE, f"{name}_by_area.csv"))
    df.columns = ["Area", "cat", "value"]
    out = defaultdict(dict)
    for a, c, v in df.itertuples(index=False):
        if pd.notna(v):
            out[a][str(c)] = float(v)
    return out


age = load("age", "Age")
gender = load("gender", "Sex")
lang = load("language", "Language group")
edu = load("education", "Education")
act = load("activity", "Activity")
inc = load("income_decile", "Income decile")

# --- geography -------------------------------------------------------------
kunta = json.load(open(os.path.join(RAW, "kunta.json")))
maakunta = json.load(open(os.path.join(RAW, "maakunta.json")))
key = json.load(open(os.path.join(RAW, "kunta_maakunta.json")))
code2region = {m["sourceItem"]["code"]: m["targetItem"]["classificationItemNames"][0]["name"] for m in key}


def centroid(geom):
    # area-weighted centroid of the largest polygon (good enough for dots)
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    best, best_a = None, -1
    for poly in polys:
        ring = poly[0]
        a = cx = cy = 0.0
        for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
            f = x1 * y2 - x2 * y1
            a += f
            cx += (x1 + x2) * f
            cy += (y1 + y2) * f
        if abs(a) > best_a and a != 0:
            best_a, best = abs(a), (cx / (3 * a), cy / (3 * a))
    return best


muni = {}  # csv area name -> (finnish name, region, lon, lat)
for f in kunta["features"]:
    p = f["properties"]
    c = centroid(f["geometry"])
    rec = (p["nimi"], code2region[p["kunta"]], c[0], c[1])
    muni[p["nimi"]] = rec
    muni[p["namn"]] = rec

areas = [a for a in age if a in muni]
missing = [a for a in age if a not in muni and a != "Total"]
if missing:
    print("WARN areas without geometry:", missing)


def adult_ages(a):
    d = {}
    for k, v in age[a].items():
        if k == "Total":
            continue
        n = 100 if k.startswith("100") else int(k)
        if n >= 18:
            d[n] = v
    return d


adult_pop = {a: sum(adult_ages(a).values()) for a in areas}


def pick(d):
    items = [(k, v) for k, v in d.items() if v > 0]
    tot = sum(v for _, v in items)
    r = rng.random() * tot
    for k, v in items:
        r -= v
        if r <= 0:
            return k
    return items[-1][0]


# --- names -----------------------------------------------------------------
fn = pd.read_excel(os.path.join(NAMES, "etunimet.xlsx"), sheet_name=None)
men = dict(fn["Miehet ens"].head(400).values.tolist())
women = dict(fn["Naiset ens"].head(400).values.tolist())
sur = dict(pd.read_excel(os.path.join(NAMES, "sukunimet.xlsx"), sheet_name="Nimet").head(1500).values.tolist())
SV_MEN = {"Erik": 5, "Johan": 5, "Anders": 4, "Mikael": 4, "Henrik": 3, "Fredrik": 3, "Lars": 3, "Peter": 3, "Kim": 2, "Jonas": 2}
SV_WOMEN = {"Anna": 5, "Maria": 5, "Kristina": 4, "Johanna": 3, "Sofia": 3, "Ulla": 3, "Linnea": 2, "Ebba": 2, "Camilla": 3, "Malin": 2}
SV_SUR = {"Andersson": 5, "Johansson": 5, "Karlsson": 4, "Nyman": 3, "Lindholm": 3, "Lindqvist": 3, "Holmström": 3, "Sjöberg": 2, "Eriksson": 4, "Björklund": 2}

EDU_MAP = {
    "9 Basic education": "basic",
    "3 Upper secondary education": "upper secondary",
    "4 Post-secondary non-tertiary education": "upper secondary",
    "5 Short-cycle tertiary education": "vocational tertiary",
    "6 Bachelor's or equivalent level": "bachelor",
    "7 Master's or equivalent level": "master",
    "8 Doctoral or equivalent level": "doctorate",
}
ROMAN = {r: i + 1 for i, r in enumerate("I II III IV V VI VII VIII IX X".split())}


def sample_activity(a, ag):
    d = act[a]
    base = {
        "employed": d.get("Employed", 0),
        "unemployed": d.get("Unemployed", 0),
        "student": d.get("Students, pupils", 0) + d.get("Conscripts, persons in non-military service", 0),
        "pensioner": d.get("Pensioners", 0),
        "other": d.get("Other persons outside the labour force", 0),
    }
    if ag >= 68:
        return "pensioner" if rng.random() < 0.95 else "employed"
    if ag >= 63:
        base["pensioner"] *= 1.0
        base["student"] *= 0.02
    elif ag >= 30:
        base["pensioner"] *= 0.12  # disability pensions etc.
        base["student"] *= 0.15
    else:
        base["pensioner"] *= 0.01
        base["student"] *= 3.0 if ag <= 24 else 1.0
    return pick(base)


def sample_edu(a, ag, activity):
    d = {EDU_MAP[k]: 0.0 for k in EDU_MAP}
    for k, v in edu[a].items():
        if k in EDU_MAP:
            d[EDU_MAP[k]] += v
    if ag < 21:
        d = {k: v for k, v in d.items() if k in ("basic", "upper secondary")}
    elif ag < 24:
        d.pop("master", None)
        d.pop("doctorate", None)
    elif ag < 28:
        d.pop("doctorate", None)
    if ag >= 70:  # older cohorts have more basic-only education
        d["basic"] = d.get("basic", 0) * 2.0
    return pick(d)


def sample_income(a, activity):
    d = {ROMAN[k]: v for k, v in inc[a].items() if k in ROMAN}
    x = pick(d)
    if activity in ("student", "unemployed"):
        x = min(x, pick(d))
    elif activity == "employed":
        x = max(x, pick(d)) if rng.random() < 0.5 else x
    return x


def income_word(dec):
    return "low income" if dec <= 3 else "middle income" if dec <= 7 else "high income"


ACT_WORD = {
    "employed": "Works",
    "unemployed": "Unemployed",
    "student": "Studies",
    "pensioner": "Retired",
    "other": "Stays at home",
}


def blurb(p):
    town = p["municipality"]
    edu_txt = {
        "basic": "basic education",
        "upper secondary": "vocational or upper secondary education",
        "vocational tertiary": "a vocational college degree",
        "bachelor": "a bachelor's degree",
        "master": "a master's degree",
        "doctorate": "a doctorate",
    }[p["education"]]
    lang_txt = "" if p["language"] == "Finnish" else f", {p['language']}-speaking"
    return f"{ACT_WORD[p['activity']]}, lives in {town}, {p['region']}; {edu_txt}, {income_word(p['income_decile'])}{lang_txt}."


personas = []
ages_drawn = {}
area_pick = {a: adult_pop[a] for a in areas}
for i in range(N):
    a = pick(area_pick)
    name_fi, region, lon, lat = muni[a]
    ag = pick(adult_ages(a))
    g = "M" if rng.random() < gender[a].get("Males", 1) / max(1, gender[a].get("Males", 1) + gender[a].get("Females", 1)) else "F"
    fi = lang[a].get("Finnish-speaking population", 0)
    sv = lang[a].get("Swedish-speaking population", 0)
    tot = sum(age[a].get(k, 0) for k in age[a] if k != "Total") or (fi + sv)
    other = max(0.0, tot - fi - sv)
    language = pick({"Finnish": fi, "Swedish": sv, "Other": other})
    activity = sample_activity(a, ag)
    education = sample_edu(a, ag, activity)
    dec = sample_income(a, activity)
    if language == "Swedish":
        first = pick(SV_MEN if g == "M" else SV_WOMEN)
        last = pick(SV_SUR) if rng.random() < 0.6 else pick(sur)
    else:
        first = pick(men if g == "M" else women)
        last = pick(sur)
    p = {
        "id": i + 1,
        "age": ag,
        "gender": g,
        "municipality": name_fi,
        "region": region,
        "lat": round(lat + rng.uniform(-0.04, 0.04), 4),
        "lon": round(lon + rng.uniform(-0.04, 0.04) * 2, 4),  # wider lon jitter: degrees are narrower up north
        "education": education,
        "activity": activity,
        "income_decile": dec,
        "language": language,
        "name": f"{first} {last}",
        "weight": 1,
    }
    p["blurb"] = blurb(p)
    personas.append(p)

os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "personas.json"), "w") as f:
    json.dump(personas, f, ensure_ascii=False, separators=(",", ":"))

# regions.geojson: official maakunta polygons, property "region"
feats = []
cents = {}
for f in maakunta["features"]:
    name = f["properties"]["nimi"]

    def rnd(c):
        return [rnd(x) for x in c] if isinstance(c[0], list) else [round(c[0], 4), round(c[1], 4)]

    geom = {"type": f["geometry"]["type"], "coordinates": rnd(f["geometry"]["coordinates"])}
    feats.append({"type": "Feature", "properties": {"region": name, "code": f["properties"]["maakunta"]}, "geometry": geom})
    c = centroid(f["geometry"])
    cents[name] = [round(c[0], 4), round(c[1], 4)]
with open(os.path.join(OUT, "regions.geojson"), "w") as f:
    json.dump({"type": "FeatureCollection", "features": feats}, f, ensure_ascii=False, separators=(",", ":"))
with open(os.path.join(OUT, "region_centroids.json"), "w") as f:
    json.dump(cents, f, ensure_ascii=False, indent=0)

# --- marginals check ---------------------------------------------------------
real_region = Counter()
real_band = Counter()
for a in areas:
    reg = muni[a][1]
    for ag, v in adult_ages(a).items():
        real_region[reg] += v
        real_band[min(ag // 10 * 10, 80)] += v
tr = sum(real_region.values())
syn_region = Counter(p["region"] for p in personas)
syn_band = Counter(min(p["age"] // 10 * 10, 80) for p in personas)
gap_r = max(abs(syn_region[r] / N - real_region[r] / tr) * 100 for r in real_region)
gap_a = max(abs(syn_band[b] / N - real_band[b] / tr) * 100 for b in real_band)
print(f"personas: {len(personas)}  regions: {len(syn_region)}")
print(f"max abs gap region share: {gap_r:.2f} pts; age band (18+, decades): {gap_a:.2f} pts")
print("language:", Counter(p["language"] for p in personas))
print("activity:", Counter(p["activity"] for p in personas))
print("education:", Counter(p["education"] for p in personas))
print("sample:", personas[0])
