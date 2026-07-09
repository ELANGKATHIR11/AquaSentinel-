export interface WaterbodyInfo {
  name: string;
  type: 'lake' | 'river';
  coordinates: [number, number]; // [lat, lng]
  volumeOrFlow: string;
  areaOrLength: string;
  perimeterOrBasin: string;
  avgTemp: number;
  avgPh: number;
  avgTurbidity: number;
  avgBod: number;
  fishes: string;
}

export const TN_WATERBODIES: WaterbodyInfo[] = [
  // LAKES
  {
    name: "Stanley Reservoir (Mettur Dam)",
    type: "lake",
    coordinates: [11.795, 77.798],
    volumeOrFlow: "93,470 M.Cft",
    areaOrLength: "15,340 ha",
    perimeterOrBasin: "185 km",
    avgTemp: 28.5,
    avgPh: 7.6,
    avgTurbidity: 8.5,
    avgBod: 2.1,
    fishes: "Rohu, Catla, Mrigal, Tilapia, Wallago Attu"
  },
  {
    name: "Pulicat Lake",
    type: "lake",
    coordinates: [13.541, 80.198],
    volumeOrFlow: "8,500 M.Cft (Est)",
    areaOrLength: "45,000 ha",
    perimeterOrBasin: "120 km",
    avgTemp: 29.2,
    avgPh: 8.1,
    avgTurbidity: 15.0,
    avgBod: 3.5,
    fishes: "Mullets, Catfish, Sea Bass, Tiger Prawns, Mud Crabs"
  },
  {
    name: "Veeranam Lake",
    type: "lake",
    coordinates: [11.317, 79.542],
    volumeOrFlow: "1,465 M.Cft",
    areaOrLength: "2,385 ha",
    perimeterOrBasin: "35 km",
    avgTemp: 27.8,
    avgPh: 7.4,
    avgTurbidity: 12.4,
    avgBod: 2.8,
    fishes: "Catla, Snakehead (Murrel), Common Carp, Tilapia"
  },
  {
    name: "Chembarambakkam Lake",
    type: "lake",
    coordinates: [13.008, 80.061],
    volumeOrFlow: "3,645 M.Cft",
    areaOrLength: "1,530 ha",
    perimeterOrBasin: "28 km",
    avgTemp: 28.1,
    avgPh: 7.8,
    avgTurbidity: 1.2,
    avgBod: 1.8,
    fishes: "Indian Major Carps, Tilapia, Mystus Vittatus"
  },
  {
    name: "Puzhal Lake (Red Hills)",
    type: "lake",
    coordinates: [13.149, 80.165],
    volumeOrFlow: "3,300 M.Cft",
    areaOrLength: "1,820 ha",
    perimeterOrBasin: "24 km",
    avgTemp: 28.0,
    avgPh: 7.7,
    avgTurbidity: 1.5,
    avgBod: 1.6,
    fishes: "Catla, Rohu, Climbing Perch, Tilapia"
  },
  {
    name: "Kaliveli Lake",
    type: "lake",
    coordinates: [12.145, 79.878],
    volumeOrFlow: "950 M.Cft (Seasonal)",
    areaOrLength: "7,000 ha",
    perimeterOrBasin: "52 km",
    avgTemp: 29.5,
    avgPh: 8.3,
    avgTurbidity: 22.0,
    avgBod: 4.2,
    fishes: "Milkfish, Pearlspot (Karimeen), Mullets, Gobies"
  },
  {
    name: "Pechiparai Reservoir",
    type: "lake",
    coordinates: [8.472, 77.291],
    volumeOrFlow: "4,450 M.Cft",
    areaOrLength: "1,600 ha",
    perimeterOrBasin: "42 km",
    avgTemp: 25.5,
    avgPh: 6.9,
    avgTurbidity: 3.5,
    avgBod: 1.1,
    fishes: "Mahseer, Catla, Wallago Attu, Eel"
  },
  {
    name: "Poondi Reservoir",
    type: "lake",
    coordinates: [13.181, 79.882],
    volumeOrFlow: "3,231 M.Cft",
    areaOrLength: "1,210 ha",
    perimeterOrBasin: "22 km",
    avgTemp: 27.9,
    avgPh: 7.5,
    avgTurbidity: 2.5,
    avgBod: 1.9,
    fishes: "Rohu, Mrigal, Tilapia, Wallago Attu"
  },
  {
    name: "Ooty Lake",
    type: "lake",
    coordinates: [11.408, 76.689],
    volumeOrFlow: "350 M.Cft",
    areaOrLength: "26 ha",
    perimeterOrBasin: "6 km",
    avgTemp: 17.5,
    avgPh: 7.1,
    avgTurbidity: 10.5,
    avgBod: 4.5,
    fishes: "Common Carp, Golden Mahseer, Rainbow Trout"
  },
  {
    name: "Kodaikanal Lake",
    type: "lake",
    coordinates: [10.231, 77.488],
    volumeOrFlow: "280 M.Cft",
    areaOrLength: "24 ha",
    perimeterOrBasin: "5 km",
    avgTemp: 18.2,
    avgPh: 7.2,
    avgTurbidity: 5.2,
    avgBod: 3.8,
    fishes: "Rainbow Trout, Common Carp, Tench"
  },
  // RIVERS
  {
    name: "Kaveri (Cauvery) River",
    type: "river",
    coordinates: [11.350, 77.800], // Middle point in TN
    volumeOrFlow: "650 m³/s (Avg)",
    areaOrLength: "416 km (in TN)",
    perimeterOrBasin: "81,155 km²",
    avgTemp: 28.0,
    avgPh: 7.8,
    avgTurbidity: 8.0,
    avgBod: 2.5,
    fishes: "Cauvery Mahseer, Catla, Rohu, Carnatic Carp, Channa"
  },
  {
    name: "Thamirabarani River",
    type: "river",
    coordinates: [8.680, 77.650], // Tirunelveli region
    volumeOrFlow: "125 m³/s",
    areaOrLength: "128 km",
    perimeterOrBasin: "4,400 km²",
    avgTemp: 26.5,
    avgPh: 7.2,
    avgTurbidity: 4.5,
    avgBod: 1.4,
    fishes: "Red-line Torpedo Barb, Spiny Eel, Catfish, Murrel"
  },
  {
    name: "Vaigai River",
    type: "river",
    coordinates: [9.710, 77.950], // Madurai region
    volumeOrFlow: "45 m³/s (Seasonal)",
    areaOrLength: "258 km",
    perimeterOrBasin: "7,009 km²",
    avgTemp: 29.0,
    avgPh: 7.5,
    avgTurbidity: 18.5,
    avgBod: 3.9,
    fishes: "Mystus Tengara, Puntius Ticto, Catfish, Nile Tilapia"
  },
  {
    name: "Palar River",
    type: "river",
    coordinates: [12.850, 79.150], // Vellore region
    volumeOrFlow: "30 m³/s (Dry/Low)",
    areaOrLength: "222 km",
    perimeterOrBasin: "17,871 km²",
    avgTemp: 29.5,
    avgPh: 7.9,
    avgTurbidity: 12.0,
    avgBod: 4.2,
    fishes: "Common Carp, Spiny Eel, Tilapia, Airbreathing Catfish"
  },
  {
    name: "South Pennar (Ponnaiyar) River",
    type: "river",
    coordinates: [12.150, 78.750], // Dharmapuri region
    volumeOrFlow: "80 m³/s",
    areaOrLength: "295 km",
    perimeterOrBasin: "16,019 km²",
    avgTemp: 28.2,
    avgPh: 7.6,
    avgTurbidity: 9.5,
    avgBod: 2.9,
    fishes: "Rohu, Mrigal, Murrel, Glass Fish, Wallago"
  },
  {
    name: "Bhavani River",
    type: "river",
    coordinates: [11.350, 77.150], // Gobichettipalayam region
    volumeOrFlow: "110 m³/s",
    areaOrLength: "217 km",
    perimeterOrBasin: "6,200 km²",
    avgTemp: 25.8,
    avgPh: 7.3,
    avgTurbidity: 5.0,
    avgBod: 1.8,
    fishes: "Golden Mahseer, Carnatic Carp, Garra Mullya, Barbs"
  },
  {
    name: "Noyyal River",
    type: "river",
    coordinates: [11.000, 77.250], // Tiruppur region
    volumeOrFlow: "12 m³/s (Low)",
    areaOrLength: "180 km",
    perimeterOrBasin: "3,510 km²",
    avgTemp: 29.8,
    avgPh: 8.2,
    avgTurbidity: 35.0,
    avgBod: 8.5,
    fishes: "African Sharptooth Catfish, Tilapia (Pollution-tolerant)"
  },
  {
    name: "Amaravati River",
    type: "river",
    coordinates: [10.650, 77.600], // Karur region
    volumeOrFlow: "95 m³/s",
    areaOrLength: "282 km",
    perimeterOrBasin: "8,280 km²",
    avgTemp: 27.0,
    avgPh: 7.4,
    avgTurbidity: 6.2,
    avgBod: 2.2,
    fishes: "Catla, Rohu, Freshwater Eel, Murrel, Barbs"
  },
  {
    name: "Vellar River",
    type: "river",
    coordinates: [11.600, 79.350], // Chidambaram region
    volumeOrFlow: "55 m³/s",
    areaOrLength: "193 km",
    perimeterOrBasin: "7,520 km²",
    avgTemp: 28.5,
    avgPh: 7.5,
    avgTurbidity: 11.2,
    avgBod: 2.7,
    fishes: "Mullets, Milkfish, Catfish, Goby, Prawns"
  },
  {
    name: "Kosasthalaiyar River",
    type: "river",
    coordinates: [13.200, 80.150], // Thiruvallur region
    volumeOrFlow: "15 m³/s (Est)",
    areaOrLength: "136 km",
    perimeterOrBasin: "3,757 km²",
    avgTemp: 29.1,
    avgPh: 7.8,
    avgTurbidity: 20.0,
    avgBod: 5.4,
    fishes: "Tilapia, Catfish, Gourami, Glass Fish"
  }
];
