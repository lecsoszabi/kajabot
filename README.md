# Kajabot

Discord bot, ami a [menum.hu/szeged](https://menum.hu/szeged) oldal API-ját lekérdezve mutatja meg a szegedi éttermek napi és heti menüjét. Csak Szegedre specializálódott.

## Parancsok

- `/kaja` — főmenü gombokkal (Mai menü / Heti menü / Éttermek)
- `/mai` — a mai menük étterményként, ◀ ▶ gombokkal és legördülő listával lapozva
- `/heti [etterem]` — egy étterem heti (hétfő–péntek) menüje, naponta lapozható; ha nem adsz meg éttermet, választólista jelenik meg
- `/etterem <nev>` — egy konkrét étterem mai menüje (autocomplete kereséssel)
- `/lista` — az összes nyilvántartott szegedi étterem listája (a Famous Steakbisztróval együtt)
- `/setup` — a bot beállítása ezen a szerveren: célcsatorna + kiemelt éttermek kiválasztása gombokkal/legördülőkkel (csak szerverkezelőknek). **Amíg ez nincs lefuttatva, a többi parancs nem elérhető.**
- `/tesztposzt` — előnézet a napi 10 órás automata posztról, azonnal (csak szerverkezelőknek)
- `/famousheti` — a Famous Steakbisztró heti menüjének kézi frissítése, tartalék az automata scraper mellé (csak szerverkezelőknek)

## Telepítés

```bash
npm install
```

### 1. Discord alkalmazás létrehozása

1. Menj a https://discord.com/developers/applications oldalra, hozz létre egy új alkalmazást (pl. "Kajabot").
2. A **Bot** fülön hozz létre egy bot usert, majd másold ki a **Token**-t.
3. A **General Information** fülön másold ki az **Application ID**-t (ez a `CLIENT_ID`).
4. A bothoz nincs szükség extra Privileged Intentre (nem olvassa a message contentet, csak slash parancsokat és gombokat használ).

### 2. `.env` beállítása

```bash
cp .env.example .env
```

Töltsd ki:
```
DISCORD_TOKEN=ide_a_bot_token
CLIENT_ID=ide_az_application_id
GUILD_ID=ide_a_szerver_id_fejlesztéshez  # opcionális
```

A `GUILD_ID`-t hagyd üresen, ha a bot minden szerveren elérhető legyen (a globális parancsregisztráció frissítése ~1 óráig eltarthat). Fejlesztés közben érdemes megadni egy `GUILD_ID`-t, mert a szerverre szóló parancsok azonnal frissülnek.

### 3. Bot meghívása a szerverre

Az Application ID felhasználásával nyisd meg (böngészőben):
```
https://discord.com/oauth2/authorize?client_id=IDE_A_CLIENT_ID&scope=bot%20applications.commands&permissions=2147485696
```
Ez a `bot` és `applications.commands` scope-okat kéri, illetve az "Send Messages" / "Embed Links" jogosultságokat.

### 4. Parancsok regisztrálása

```bash
npm run deploy
```

### 5. Bot indítása

```bash
npm start
```

## Beállítás szerveren: /setup

A csatornát és a kiemelt éttermeket nem `.env`-ben, hanem Discordon belül, a `/setup` paranccsal állítod be (szerverenként külön, a `data/guild-config.json` fájlba mentve — ez nincs verziókezelve):

1. Futtasd le a `/setup` parancsot (szerverkezelői jog kell hozzá).
2. **1/2 lépés:** egy natív Discord csatorna-választó jelenik meg — válaszd ki, melyik csatornára posztoljon a bot. Nem kell a csatorna ID-t kézzel másolgatni.
3. **2/2 lépés:** egy legördülő lista jelenik meg a nyilvántartott szegedi éttermekkel (Famous Steakbisztróval együtt) — válassz ki 1-5 kiemelt éttermet, amit a napi 10 órás poszt kiírjon.
4. Ezután minden más parancs (`/mai`, `/heti`, `/lista`, `/etterem`, `/tesztposzt`, `/famousheti`) elérhetővé válik. Amíg a `/setup` nincs lefuttatva, ezek egy figyelmeztető üzenetet adnak vissza.
5. A `/setup` bármikor újra lefuttatható, ha meg akarod változtatni a csatornát vagy az éttermeket — az előző választás alapértelmezettként előre ki lesz jelölve.

A napi poszt minden nap 10:00-kor (Europe/Budapest idő szerint) automatikusan kimegy minden szerverre, ahol a `/setup` be van fejezve — a `/tesztposzt` paranccsal bármikor kipróbálhatod anélkül, hogy 10 óráig várnál.

**Ezzel együtt minden nap:**
- a poszt `@everyone`-nal megy ki (ehhez a botnak "Mention @everyone" jogosultság kell a szerveren)
- ha a kiemelt éttermek bármelyikének mai menüjében szerepel a "gyros" vagy "kebab" szó, a poszt kaki emoji kerettel és "FOSATÓS GYROS RIADÓ" felirattal jelenik meg
- egy szavazás-üzenet is megy egy legördülővel ("Mikor mész? 12:00 / 12:30 / 13:00 / 13:30 / 14:00 / Nem megyek") — ez a **következő napi poszt előtt törlődik** és újraindul, a menüs poszt maga viszont a csatornában marad
- ha egy étteremnek aznap pontosan 1 levese és 1 főétele van (pl. a Famousnak mindig), az embed alján megjelenik az összár is 10% szervizdíjjal, desszerttel és anélkül

**Fontos:** az ütemezés a bot folyamatosan futó Node processzén belül működik (nincs külön cron job), tehát a botnak 10:00-kor futnia kell ahhoz, hogy posztoljon. Ha csak alkalmanként futtatod a gépeden, érdemes egy mindig bekapcsolva lévő gépen / szerveren (pl. egy kis VPS-en, `pm2`-vel vagy hasonló process managerrel) hostolni.

## Famous Steakbisztró — automatikus heti menü

A Famous Steakbisztró nincs fent a menum.hu-n, a heti menüjét Facebookon posztolják. A Facebook bejelentkezés nélkül nem adja ki a hírfolyam-posztok teljes szövegét sima HTTP-lekéréssel (bot-detektálás), de egy fejnélküli Chrome-mal (Puppeteer), ami a poszt saját permalink-oldalát tölti be, igen — ez fut le automatikusan.

**Hogyan működik:**
1. A bot indításkor, majd utána 6 óránként megnézi, van-e eltárolt Famous-menü a mai napra.
2. Ha **van**, semmit nem csinál — nem indít böngészőt, nincs felesleges terhelés (pontosan addig használja az egyszer letöltött heti adatot, amíg ki nem fogy).
3. Ha **nincs** (pl. új hét kezdődött), egy fejnélküli Chrome-mal megnyitja a [facebook.com/famousszeged](https://www.facebook.com/famousszeged) oldalt, végignézi a legutóbbi posztokat, és megkeresi köztük a heti menüt (legalább 4 felismerhető nap kell hozzá — `HÉTFŐ (08.10.)` stílusú fejlécekkel —, különben nem fogadja el, nehogy egy véletlen napnév-említést heti menünek nézzen).
4. A talált menüt elmenti a `data/famous-week.json` fájlba, dátum szerint napra bontva. Ez a fájl nincs verziókezelve (`.gitignore`).

**Ha elromlik** (pl. a Facebook megváltoztatja az oldal felépítését): a szerver logban `Famous automatikus frissítés sikertelen` üzenet jelenik meg, és a `/famousheti` paranccsal (ami egy beillesztő ablakot nyit) bármikor kézzel is frissíthető — másold be a Facebook poszt teljes szövegét, a bot ugyanazzal a logikával dolgozza fel.

**Extra függőség:** a scraper miatt a bot Puppeteer-t (és egy letöltött Chromium-ot, kb. 300 MB) is tartalmaz — ezt figyelembe kell venni a hostingnál (lásd lent).

## Technikai megjegyzések

- A menum.hu API-t (`GET /api/menus?date=YYYY-MM-DD&city=szeged`) 10 percig cache-eli a bot memóriában, hogy ne terhelje feleslegesen a szolgáltatást.
- A heti menü a hét hétfő–péntek napjaira 5 külön API-hívást aggregál (hétvégére jellemzően nincs napi menü, ezért az nem szerepel).
- A bot kizárólag Szegedre van hardcode-olva (`city=szeged`); más városra nem bővíthető parancs nélküli módosítás nélkül.
- A `/mai` parancsban és a napi 10 órás posztban a Famous Steakbisztró mindig elsőként jelenik meg, a többi (menum.hu-s) étterem utána, névsorrendben.

## Ingyenes hosting: Fly.io

A bot Node.js-t igényel, folyamatosan futnia kell (WebSocket-kapcsolat a Discorddal). Fly.io ingyenes kerete kis, 256 MB RAM-os géptípusokat ad — ez önmagában szűk lenne a Puppeteernek, ezért a Famous-scrapelést **kivittük GitHub Actionsbe** (lásd fent), a bot Fly.io-n futó példánya pedig a `FAMOUS_DATA_URL`-en keresztül, egy sima HTTP-lekéréssel olvassa az adatot — nem indít Chromiumot, simán elfér 256 MB-ban.

### 1. Fly.io fiók és CLI

1. Regisztrálj a https://fly.io oldalon (bankkártya-ellenőrzés kell, de az ingyenes kereten belül nem számláz).
2. Telepítsd a `flyctl`-t: https://fly.io/docs/flyctl/install/
3. Jelentkezz be: `fly auth login`

### 2. App létrehozása

A repóban már van `Dockerfile` (a Puppeteer letöltését kihagyja build közben, mivel ezen a gépen nem fut) és `.dockerignore`. A `~/kajabot` mappából:

```bash
fly launch --no-deploy
```

Ez felismeri a Dockerfile-t, és végigvisz egy pár kérdésen (app név, régió — Frankfurt/`fra` van legközelebb), és létrehoz egy `fly.toml`-t. A géptípusnál maradhat az alapértelmezett 256 MB-os ingyenes szint.

### 3. Titkok beállítása

```bash
fly secrets set DISCORD_TOKEN=ide_a_token CLIENT_ID=ide_az_app_id
fly secrets set FAMOUS_DATA_URL=https://raw.githubusercontent.com/lecsoszabi/kajabot/main/data/famous-week.json
```

### 4. Perzisztens tárhely a beállításoknak

A `/setup` és a szavazások adata (`data/guild-config.json`, `data/polls.json`) a konténer lemezén él, ami újraindításkor/deploy-nál elveszne. Ehhez egy Fly Volume kell:

```bash
fly volumes create kajabot_data --size 1 --region fra
```

majd a `fly.toml`-ba:
```toml
[mounts]
  source = "kajabot_data"
  destination = "/app/data"
```

### 5. Deploy

```bash
fly deploy
fly deploy --no-cache  # ha korábbi build cache-elt puppeteer-t próbálna letölteni
```

### 6. Parancsok regisztrálása

A `npm run deploy`-t (a slash parancsok regisztrálását) egyszer, bármelyik gépről futtathatod a `.env`-eddel — ez nem a botfolyamat része, csak egyszeri Discord API hívás:
```bash
npm run deploy
```

### 7. GitHub Actions bekapcsolása

A `.github/workflows/famous-scrape.yml` már benne van a repóban — amint pusholod a GitHubra, automatikusan elindul az ütemezés szerint. A Famous mindig hétfőn posztolja a heti menüt (de az időpont ingadozik, 7-11 óra magyar idő körül), ezért a workflow **hétfőn óránként** (5-14 UTC) néz rá; ha addig nem jönne ki, **kedden és szerdán is** (tartalékként), utána viszont leáll a következő hétig. Ha már megvan az adat, egy másodperc alatt kilép, nem terheli feleslegesen a Facebookot. Nincs hozzá extra secret, a beépített `GITHUB_TOKEN`-t használja a commitoláshoz. Manuálisan is elindíthatod a GitHub repo "Actions" fülén, "Run workflow" gombbal, ha azonnal ki akarod próbálni.

## Más hosting opciók

Ha mégsem Fly.io-t választanád, és a géped elbírja a ~300–500 MB-os Puppeteer-terhelést is (nem csak a `FAMOUS_DATA_URL`-es könnyű módot):

- **Oracle Cloud Free Tier**: örökre ingyenes, 1–4 GB RAM-os ARM VM, bőven elég Puppeteerrel együtt is (ne állíts be `FAMOUS_DATA_URL`-t, akkor a bot maga scrapel).
- **Saját gép otthon** (régi laptop, Raspberry Pi), `pm2`-vel vagy `systemd` service-szel — nulla költség, de a gépnek bekapcsolva kell lennie.
- **Render / Railway free tier**: ezek jellemzően elalvó ("sleep") web service-ek, ami egy állandó Discord-kapcsolatnak kevésbé ideális.
