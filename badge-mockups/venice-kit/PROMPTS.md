# Floorcast station photo: Venice kit (v2)

## What went wrong last time

- **It looked like a cheap 3D render.** The model copied the 3D render I'd included as a "layout guide", plus the cartoon-style lanyard mockup. Both are gone from this kit. The layout is now described in words.
- **The logo turned into the Vans shoe logo.** The prompt typed the word "VANS", so the model reached for the famous shoe-brand logo it already knows. The new prompts never type that word. They point at the logo image instead and say plainly that it is *not* the shoe-company logo.

## Files

**`upload/`: upload these to Venice, in this order**

| # | File | What it's for |
|---|------|---------------|
| 1 | `1-scanner-zebra-tc8300.webp` | The scanner's real shape and materials |
| 2 | `2-lanyard-strap.png` | The strap laid flat: red→blue gradient with the logo repeating |
| 3 | `3-logo-exact.png` | The logo by itself, so it gets copied exactly |
| 4 | `4-badge-john-doe.png` | The badge in the holder |
| 5 | `5-box-label.png` | The box label |
| 6 | `6-scanner-screen.png` | What the screen shows |

**`finish-in-photopea/`: the same artwork, for pasting over the AI image at the end so the text and QR codes come out exact.**

## Model and settings

- **Model:** Nano Banana Pro, or Nano Banana 2.1 if listed.
- **Aspect ratio:** 3:2.
- **Resolution:** the highest offered.
- **Images per run:** 4.
- **Negative prompt:** if the model has a negative prompt field, paste this in:

```
3D render, CGI, cartoon, illustration, plastic look, video game, Blender, octane render, smooth untextured surfaces, Vans Off The Wall logo, Vans shoe company logo, skateboard lettering, checkerboard pattern, purple, violet, magenta, extra text, watermark
```

## Step 1: the base photo (upload images 1, 2 and 3)

Start with only three images. Fewer references give more realism.

```
A real photograph, not a 3D render. Editorial product photography for an industrial tech brand, shot on a Canon EOS R5 with an 85mm lens at f/2.8, natural light falloff, true-to-life materials, subtle film grain.

Setting: a worn, sealed concrete workbench inside a real working warehouse. The background is heavily out of focus: blue and orange steel pallet racking, stacked cardboard cartons, warm high-bay lights as soft round bokeh. A real place, slightly lived-in, a little dust on the bench.

Hero subject, center: the rugged handheld mobile computer from image 1, exactly that device: a pistol grip with a ribbed rubber handle, a black and gray body with a silver bezel, and a yellow trigger. It stands upright on its base, angled slightly toward the camera, screen on with a dark blue glow. Real scuffs, fingerprints on the glass, accurate proportions.

Behind it on the left: a brown corrugated cardboard shipping box with clear packing tape and a plain white rectangular shipping label on the front.

In the foreground: a woven polyester lanyard, loosely coiled on the bench the way someone dropped it. The strap must match image 2 exactly: a smooth gradient from red (#C42A2A) to blue (#2AAAC4) with only neutral gray in between, no purple. A black logo is printed repeatedly along it, and the logo must be copied exactly from image 3: two slanted black flame shapes followed by bold, blocky letters. This is a custom logo. It is NOT the Vans shoe company logo: no "Off The Wall", no skateboard lettering, no long-tailed V. The ends meet in a chrome crimp with a metal bulldog clip holding a clear vinyl badge holder lying flat, facing the camera.

Lighting: a large soft window light from the upper left, soft natural shadows, a faint cool rim light from behind. Color grade: neutral, true colors. No text anywhere except the printed lanyard logo.
```

Pick the most realistic result, even if the screen, badge or label are blank or wrong.

## Step 2: fill in the details (one edit at a time)

Upload the chosen image as the first image, plus the one reference listed for each edit:

- **Screen** (+ image 6): `Put exactly the screen from the second image onto the handheld's display, flat and in perspective, slightly glowing, with a faint real glass reflection. Change nothing else.`
- **Badge** (+ image 4): `Put exactly the badge card from the second image inside the clear vinyl badge holder, in perspective, behind the vinyl with a soft glare. Change nothing else.`
- **Label** (+ image 5): `Make the white label on the box exactly the label from the second image, applied flat on the cardboard in perspective, slightly matte. Change nothing else.`
- **Logo** (+ image 3), if it drifted: `The logo printed on the lanyard must be exactly the logo in the second image: two slanted flame shapes and blocky letters. It is not the Vans shoe logo. Change nothing else.`

## Step 3: finish in Photopea

AI models scramble QR codes and small text. If the screen, badge or label still aren't exact, paste the real files over them. Photopea is free at photopea.com.

1. **Open the image.** File → Open your best result.
2. **Place a file.** File → Place the matching file from `finish-in-photopea/`.
3. **Warp it into place.** Edit → Transform → Distort, then drag the four corners onto the screen, badge or label.
4. **Blend it in:**
   - **Screen:** opacity 100%. Add a new layer on top with a white-to-clear gradient at 10–15% for glass glare.
   - **Badge:** opacity about 92%, so the vinyl sheen shows through.
   - **Label:** blend mode Multiply, so the cardboard texture shows through.
5. **Export.** File → Export as → PNG.

## If it still looks off

- **Still looks like CGI:** add "photographed, not rendered, real-world imperfections, natural lens vignetting, slight chromatic aberration".
- **Logo still turns into the shoe brand:** run Step 1 with images 1 and 2 only and describe the logo as "small black flame emblems with blocky letters". Then fix the logo with the Step 2 logo edit.
- **Purple creeps into the strap:** add "the strap fades red → neutral gray → blue, absolutely no purple".
- **Wrong scanner shape:** add "Zebra TC8300 style rugged gun-shaped mobile computer, not a phone on a stick".

The QR codes are samples and don't scan to anything real.
