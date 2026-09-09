# Third-party software

OnFire's own code is licensed under Apache-2.0. Dependencies and incorporated
third-party code retain their original copyrights and licenses; the project
license does not replace those terms.

The [dependency inventory](docs/dependency-licenses.json) records names, installed
versions, license metadata, and available upstream attribution. Regenerate it
after a frozen install with `node scripts/dependency-licenses.mjs`. It includes
development and installed optional dependencies, and records the host platform.
It does not cover binaries installed only on other platforms or verify ownership
of every source file. Keep the lockfile and upstream license/NOTICE files when
redistributing dependencies; include the applicable texts and notices alongside
bundled/minified distributions.

## Terms requiring particular attention

| Component | License / attribution | Redistribution |
| --- | --- | --- |
| shadcn/ui-derived components in `src/components/ui` | MIT, Copyright (c) 2023 shadcn; adapted for OnFire | Original license text is retained below. |
| Lucide icons, including Feather-derived icons | ISC, Lucide Icons and Contributors; MIT, Cole Bemis for Feather-derived icons | Both upstream notices are retained in [the icon notice](docs/licenses/lucide.txt). |
| [caniuse-lite](https://github.com/browserslist/caniuse-lite) and [Can I Use data](https://caniuse.com/) | CC-BY-4.0; package author Ben Briggs, upstream data by Alexis Deveria and contributors | Attribute the data and link [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). caniuse-lite compresses the upstream data; OnFire does not modify that package's data. Retain attribution if redistributing it. |
| [DOMPurify](https://github.com/cure53/DOMPurify) | MPL-2.0 OR Apache-2.0; Dr.-Ing. Mario Heiderich, Cure53 | Apache-2.0 is an available alternative; retain the relevant upstream notices. |
| [Lightning CSS](https://github.com/parcel-bundler/lightningcss) and its native bindings | MPL-2.0; Parcel contributors | Keep MPL notices and satisfy covered-source availability for distributed covered files, including modifications. This does not relicense independent OnFire code. |
| [Sharp/libvips native packages](https://github.com/lovell/sharp-libvips) | Sharp is Apache-2.0; the installed libvips binary package is LGPL-3.0-or-later | If shipping native binaries or a container with them, preserve the bundled dependency notices and meet LGPL source and relinking requirements. Review the actual target-platform binary; do not assume Sharp's top-level license covers libvips. |

The remaining inventory includes MIT, ISC, Apache-2.0, BSD-2/3-Clause, 0BSD,
MIT-0, BlueOak-1.0.0, CC0-1.0, Python-2.0, and dual MIT/Apache-2.0 metadata.
Their upstream terms and notices still apply. `pnpm licenses list --prod` alone
can omit native optional dependencies; the committed inventory deliberately uses
the full installed tree. External service API terms and trademarks are separate
from this software license.

## shadcn/ui license

```text
MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
