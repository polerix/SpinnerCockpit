import { rename, rmdir, writeFile } from "node:fs/promises";

const appPage = new URL("../docs/app.html", import.meta.url);
const homePage = new URL("../docs/index.html", import.meta.url);
const noJekyll = new URL("../docs/.nojekyll", import.meta.url);
const nestedCesium = new URL("../docs/SpinnerCockpit/cesium/", import.meta.url);
const publishedCesium = new URL("../docs/cesium/", import.meta.url);
const nestedBase = new URL("../docs/SpinnerCockpit/", import.meta.url);

await rename(appPage, homePage);
// Pages already serves docs/ at /SpinnerCockpit/; the Cesium plugin copies
// files under the base segment, so move them to the actual publishing root.
await rename(nestedCesium, publishedCesium);
await rmdir(nestedBase);
await writeFile(noJekyll, "");
