# Zone & Conduit Designer

**[design.iec62443.au](https://design.iec62443.au/)** - a free, fully client-side designer
for IEC 62443-3-2 / CLC TS 50701 style **zone and conduit diagrams**. Beta.

Practitioners partitioning a system under consideration into zones and conduits mostly do
it in Visio or draw.io with home-made templates. This is a purpose-built alternative: draw
the diagram, record the attributes the standard asks for, and export wherever the work
needs to go.

## Features

- **Zones** (nestable), grey **subsystem** groupings, and **conduits** between zones -
  gateway, filtering (security device at either or both ends), or unidirectional (data
  diode), drawn in the visual style of the TS 50701 figures.
- Per zone and conduit: name, accountable organisation, logical and physical boundaries,
  safety designation, logical and physical access points, data flows, communication
  channels, notes, an asset list, and a target security level (**SL-T**) as the seven-value
  vector over the foundational requirements (IAC, UC, SI, DC, RDF, TRE, RA) - or no SL-T,
  for example when covered by a code of practice.
- Optional **Purdue level bands** (5 and 4 / 3 and DMZ / 2 / 1 and 0) with draggable
  dividers.
- **Tables** view: an asset register and a zone/conduit characteristics register, each
  downloadable as CSV.
- **Exports**: lossless re-importable XML, Visio (`.vsdx`), draw.io (`.drawio`), SVG, PNG.
- **Private by design**: plain static HTML/JS, no build step, no server, no accounts, no
  analytics beyond standard web logs. Work autosaves to the browser's local storage and
  never leaves the machine.

## Running locally

Any static file server works (ES modules need http, not file://):

```
python -m http.server 8000
```

## Licence and disclaimer

MIT - see [LICENSE](LICENSE).

Not affiliated with or endorsed by the IEC, ISA or CENELEC. IEC 62443 is the property of
the IEC and ISA, and CLC/TS 50701 of CENELEC - referenced only to describe what the
diagrams depict. The tool draws the documentation; it is not a substitute for the
standards or for a risk assessment.
