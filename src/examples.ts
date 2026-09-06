/**
 * Worked examples, in the exact argument shape create_map accepts. These are
 * few-shot material for a model that has never made a maproll map, so each
 * one demonstrates a different idiom rather than a different dataset.
 */
export const EXAMPLES = [
  {
    request: "Map coffee consumption per capita",
    idiom: "Plain choropleth: numeric values, sequential scale.",
    tool: "create_map",
    args: {
      scope: "world",
      title: "Coffee consumption per capita",
      subtitle: "kg per person per year",
      legendTitle: "kg / person",
      values: [
        { id: "FI", value: 12 },
        { id: "NO", value: 9.9 },
        { id: "BR", value: 5.8 },
        { id: "US", value: 4.2 },
      ],
    },
  },
  {
    request: "Show which countries are in NATO versus BRICS",
    idiom: "Categorical: text buckets, not numbers. The legend names the groups.",
    tool: "create_map",
    args: {
      scope: "world",
      title: "Two blocs",
      values: [
        { id: "US", category: "NATO" },
        { id: "GB", category: "NATO" },
        { id: "CN", category: "BRICS" },
        { id: "RU", category: "BRICS" },
      ],
    },
  },
  {
    request: "Colour Ukraine blue and Russia red",
    idiom: "Flat paint: colours with no values behind them, so turn the legend off.",
    tool: "create_map",
    args: {
      scope: "world",
      legend: false,
      values: [
        { id: "UA", color: "#2563eb" },
        { id: "RU", color: "#dc2626" },
      ],
    },
  },
  {
    request: "Highlight the EU member states",
    idiom: "Highlight-only: which regions, not how much. Use `highlight`, not `values`.",
    tool: "create_map",
    args: {
      scope: "EU",
      theme: "light-mono",
      title: "European Union",
      legend: false,
    },
  },
  {
    request: "Draw the shipping route from Shanghai to Rotterdam",
    idiom: "A sea route threads Suez instead of cutting overland. Endpoints can be lat,lon.",
    tool: "add_layers",
    args: {
      map: "https://api.maproll.io/map.svg?scope=world&theme=dark",
      routes: [
        { from: "31.23,121.47", to: "51.92,4.48", sea: true, arrow: true },
      ],
    },
  },
  {
    request: "Put a marker on Constanța",
    idiom: "Resolve the coordinates with find_places first — never guess lat/lon.",
    tool: "find_places → add_layers",
    args: {
      findPlaces: { query: "Constanța", kind: "city" },
      thenAddLayers: {
        markers: [{ lat: 44.17672, lon: 28.65076, icon: "anchor", label: "Constanța" }],
      },
    },
  },
  {
    request: "A report-grade regional map of Romania",
    idiom: "Country scope uses ISO 3166-2 ids, plus cartographic furniture.",
    tool: "create_map",
    args: {
      scope: "RO",
      theme: "light",
      title: "Romania",
      subtitle: "Regional report",
      northArrow: true,
      scaleBar: true,
      graticule: true,
      values: [
        { id: "RO-B", value: 500 },
        { id: "RO-CJ", value: 200 },
        { id: "RO-CT", value: 100 },
      ],
    },
  },
  {
    request: "Show population change, positive and negative",
    idiom: "Diverging scale for values that run either side of a midpoint.",
    tool: "create_map",
    args: {
      scope: "world",
      colorScale: "diverging",
      title: "Population change",
      legendTitle: "% since 2015",
      values: [
        { id: "NG", value: 14.2 },
        { id: "US", value: 3.1 },
        { id: "IT", value: -2.4 },
        { id: "JP", value: -3.9 },
      ],
    },
  },
] as const;
