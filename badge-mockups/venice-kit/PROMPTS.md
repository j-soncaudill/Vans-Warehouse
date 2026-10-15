# Floorcast station product photo: Venice kit

A guide for making one photorealistic product image of station mode with Venice's image tools. The image shows three things:

- a handheld scanner showing the sign-in card;
- the branded lanyard with John Doe's badge;
- a box with a Floorcast label.

The image has no captions.

## Files

| # | File | What it's for |
|---|------|---------------|
| 1 | `1-scanner-zebra-tc8300.webp` | Shape and materials of the scanner |
| 2 | `2-scanner-screen-hi-john.png` | Exactly what the scanner screen shows |
| 3 | `3-badge-john-doe.png` | The 3×4 badge in the clear holder |
| 4 | `4-lanyard-with-badge.png` | Lanyard colors, logo repeat, crimp and clip |
| 5 | `5-box-label-walker-library.png` | The 4×3 label on the box |
| 6 | `6-layout-guide.png` | Rough layout and lighting (a 3D render, not a style target) |

## Model

- **First choice:** Nano Banana Pro, or Nano Banana 2.1 if it's listed. It keeps logos, colors and screen text the most consistent across several references.
- **If text or numbers come out garbled:** GPT Image 2.
- **If you want more photographic light and materials:** Seedream V4.5.
- **Settings:**
  - Aspect ratio 3:2 (landscape), or 4:5 for social posts.
  - Highest resolution offered.
  - Generate 4 images per run.

Use **Edit Image → Combine Images** in the Venice app (or the `/image/multi-edit` API). Most models take 3 reference images. Nano Banana Pro, Seedream and Flux 2 Max take up to 6.

## Prompt with 6 images (Nano Banana Pro)

Upload images 1 to 6 in this order, then paste the prompt below.

```
Photorealistic commercial product photograph, shot on a full-frame camera with a 50mm lens at f/4. Natural, high-end, no text or captions added anywhere.

Scene: a sealed gray concrete workbench in a warehouse. The background is softly out of focus: blue and orange pallet racking, cardboard boxes on shelves, warm overhead lights making soft bokeh.

Use image 6 only as a guide for layout and lighting:
- The scanner stands upright in the center on its silver end cap.
- The box sits behind it on the left.
- The lanyard lies loosely coiled on the bench in front, with the badge holder lying flat toward the camera.

The scanner is exactly the rugged handheld from image 1: a black body with a silver bezel, a rubber ribbed pistol grip and a yellow trigger. Its screen faces the camera and shows exactly the screen in image 2: a dark card with a glowing cyan flame and the words "Hi, John" and "Start scanning your items." The screen glows softly with a subtle glass reflection.

The lanyard is exactly the one in image 4: a flat polyester strap that fades from red (#C42A2A) on one side to blue (#2AAAC4) on the other with no purple, black "VANS" logos repeating along it, a chrome crimp and a bulldog clip. The clip holds a clear vinyl badge holder containing exactly the badge in image 3 (JOHN DOE, crew badge with a QR code).

The box is a plain brown corrugated cardboard shipping box with clear packing tape. The white 4x3 inch label in image 5 is stuck flat on its front.

Lighting: a soft key light from the upper left, gentle shadows on the bench, a cool rim light from behind.
Mood: clean, modern, premium. Realistic textures: rubber grip, brushed metal, corrugated cardboard, woven lanyard fabric, glossy vinyl.
```

## Prompt with 3 images (most other models)

Upload images 1, 4 and 5. Your app will put the real screen and badge in afterward (see the last step).

```
Photorealistic commercial product photograph, 50mm lens, shallow depth of field, no added text. On a gray concrete workbench in a softly blurred warehouse (blue and orange pallet racking, warm bokeh lights):
- the rugged handheld scanner from image 1 stands upright in the center, its screen facing the camera, glowing with a dark blue screen;
- a cardboard shipping box sits behind it on the left, with the white label from image 3 on its front;
- the red-to-blue lanyard from image 2 (red #C42A2A fading to blue #2AAAC4, no purple, black VANS logos, chrome crimp and bulldog clip) lies coiled in front, with a clear vinyl badge holder lying flat.

Soft key light from the upper left, a cool rim light, realistic materials.
```

## Workflow

1. **Generate.** Run the prompt and get 4 results. Keep the best composition, even if small details are off.
2. **Fix one thing per pass.** Feed the chosen image back in with the matching reference and a short instruction. For example:
   - "Make the lanyard colors match image 2 exactly: red to blue, no purple."
   - "Replace the scanner screen with exactly image 2, flat and centered, keep the reflection."
   - "Make the badge in the holder exactly image 3."
   - "Remove any text that isn't on the label, badge or screen."
3. **Paste in the real artwork.** Image models scramble QR codes and small text, so finish in Photopea (free, photopea.com) or Photoshop:
   1. Place `2-scanner-screen-hi-john.png` over the scanner screen. Use Edit → Transform → Perspective or Distort to match the four corners. Add a light white gradient on top at 10–15% for glare.
   2. Do the same with `3-badge-john-doe.png` inside the badge holder. Lower its opacity slightly (90–95%) so the vinyl sheen shows through.
   3. Do the same with `5-box-label-walker-library.png` on the box. Use the Multiply blend mode at 100% so the cardboard texture shows.
   4. Export as PNG or high-quality JPG.

The QR codes in these files are samples:
- The badge (`VW-BADGE:sample-john-doe`) won't sign anyone in.
- The label code VW-WL7K2R isn't a real box.

## If something keeps going wrong

- **Purple in the lanyard:** add "no purple, no violet, no magenta" and attach image 4 again.
- **Scanner looks like a phone:** add "rugged industrial pistol-grip barcode scanner, Zebra TC8300 style".
- **Too clean or CGI-looking:** add "subtle dust on the bench, slight film grain, natural imperfections".
- **Extra text or logos invented:** add "no extra text, no extra logos, nothing written on the bench or background".
