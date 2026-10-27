# Covered components and source availability

Application code and original assets use MIT. This does not relicense any third-party component.

## ELK / elkjs 0.9.3 — EPL-2.0

The EPL-covered component's source is provided under EPL-2.0 in the accompanying `sources/` directory. Keep this directory, this statement and the upstream licenses when redistributing it. File names, source URLs and hashes are recorded in [source-manifest.json](source-manifest.json). Extract ZIP/JAR archives with any standard ZIP tool; JARs here are source archives, not required runtime executables.

- Exact elkjs source and unminified engine: `sources/elkjs-0.9.3-a8304cf79fde75bc2ab1a89d28320f53f8637436.zip`. [Upstream commit](https://github.com/kieler/elkjs/tree/a8304cf79fde75bc2ab1a89d28320f53f8637436). All nine installed lib files match the Git blob hashes in this commit; no deliberate upstream source edits were made. Bundling/minification changes the distribution form.
- [Official release notes](https://github.com/kieler/elkjs/releases/tag/0.9.3) identify ELK 0.9.1 plus [patch #955](https://github.com/eclipse-elk/elk/pull/955). The eleven `org.eclipse.elk.*-0.9.1-sources.jar` archives provide the relevant official Maven source modules; `elk-pr955.patch` is supplied separately. Java base tag: [62d5909f96fad541bc101ad52dabaece6b7eab7e](https://github.com/eclipse-elk/elk/tree/62d5909f96fad541bc101ad52dabaece6b7eab7e). The full repository ZIP timed out; the source modules were downloaded from Maven instead.
- Build-declared supporting source versions are also included: GWT 2.10.0, Guava 31.1-jre, GWT EMF 2.12.4, Xtext/Xtend 2.28.0. Their original per-file copyright notices remain intact. EMF uses EPL-1.0; other files retain their stated Apache/EPL terms. Full EPL-1.0, EPL-2.0 and Apache-2.0 texts are in `licenses/`. These are not all MIT.

### Verified scope and remaining provenance limit

Source acquisition and unchanged installed elkjs files were verified; the supplied Maven archives were checked against the repository's published SHA-1 values and additionally recorded with SHA-256. The upstream build uses a local ELK checkout and a melk `0.10.0-SNAPSHOT` compiler; its historical CI follows `master`. No immutable compiler snapshot or complete historical Java build manifest was established. We did not reproduce the official Java/GWT build byte for byte. Official base-version/patch attribution and source access are provided; this is not a certification that every historical build input has been reconstructed.

## Lightning CSS 1.33.0 — MPL-2.0

[Upstream](https://github.com/parcel-bundler/lightningcss). This is a build dependency. Application packages and the repository source ZIP omit node_modules and the native compiler binaries. If redistributing those tools separately, preserve their own licenses and corresponding-source requirements.

## Dual licenses

DOMPurify offers MPL-2.0 or Apache-2.0; JSZip offers MIT or GPL-3.0-or-later. Their alternative licenses are retained in the notices. A GPL alternative alone does not make the entire application GPL.

## Electron / Chromium

Desktop binaries retain the official runtime LICENSE and LICENSES.chromium.html. The application MIT license is named LICENSE-pinwheel.txt beside them to avoid replacing Electron's LICENSE. macOS also keeps all three in the installed app. This audit did not independently clear every underlying Chromium component or patent.

## Build-only packages with incomplete upstream legal packaging

@electron-internal/extract-zip@1.0.5 declares BSD-2-Clause, but its installed package and pinned repository root lack a standalone license file. This package is an installation tool, not bundled application code; node_modules is excluded from the repository and all application archives. Do not redistribute a full development dependency tree as though this inventory alone cleared it. The Rolldown binding uses the retained license from the matching upstream/version.
