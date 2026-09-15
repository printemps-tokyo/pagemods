// The list of mods the content script knows about, in panel order.
//
// To add a feature: write a module that implements ContentModule (see
// lib/registry.ts), give it an id nobody else uses, and append it here. If
// it needs the service worker, export an install function and a message
// handler from a background.ts next to it and wire both in src/background.ts.

import type { ContentModule } from "../lib/registry.js";
import { autoreloadModule } from "./autoreload/content.js";
import { envswitchModule } from "./envswitch/index.js";
import { formfillModule } from "./formfill/index.js";
import { stylesModule } from "./styles/index.js";
import { imagesModule } from "./images/index.js";

export const MODULES: ContentModule[] = [
  formfillModule,
  stylesModule,
  envswitchModule,
  imagesModule,
  autoreloadModule,
];
