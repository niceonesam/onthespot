"use client";

import React from "react";
import Link from "next/link";
import { GoogleMap, MarkerClustererF, MarkerF } from "@react-google-maps/api";
import SpotSheet from "@/components/map/SpotSheet";
import type { Spot, SpotVisibility } from "@/map/types";

type SpotSheetSnap = "peek" | "half" | "full";

type ClusterStyleLike = {
  url: string;
  height: number;
  width: number;
  textColor?: string;
  textSize?: number;
  fontWeight?: string;
  anchorText?: [number, number];
  anchorIcon?: [number, number];
  backgroundPosition?: string;
};

function distanceMetersBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

function viewportRadiusFromMap(map: google.maps.Map) {
  const center = map.getCenter();
  const bounds = map.getBounds();
  if (!center || !bounds) return null;

  const centerPoint = { lat: center.lat(), lng: center.lng() };
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const nw = { lat: ne.lat(), lng: sw.lng() };
  const se = { lat: sw.lat(), lng: ne.lng() };

  const candidates = [
    { lat: ne.lat(), lng: ne.lng() },
    { lat: sw.lat(), lng: sw.lng() },
    nw,
    se,
  ];

  const farthest = Math.max(
    ...candidates.map((point) => distanceMetersBetween(centerPoint, point))
  );

  return Math.ceil(farthest * 1.15);
}

function viewportBoundsFromMap(map: google.maps.Map) {
  const bounds = map.getBounds();
  if (!bounds) return null;

  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();

  return {
    north: ne.lat(),
    south: sw.lat(),
    east: ne.lng(),
    west: sw.lng(),
  };
}

type MapViewProps = {
  pos: { lat: number; lng: number };
  map: google.maps.Map | null;
  setMap: (map: google.maps.Map | null) => void;
  setMapCenter: (center: { lat: number; lng: number } | null) => void;
  setViewportRadiusM: (radius: number | null) => void;
  setViewportBounds: (bounds: { north: number; south: number; east: number; west: number } | null) => void;
  setCrosshairPulseKey: React.Dispatch<React.SetStateAction<number>>;

  selected: Spot | null;
  pulsingMarkerId: string | null;

  rankedFilteredSpots: Spot[];
  shouldClusterMarkers: boolean;
  temporalClusterGroups: Array<{
    key: string;
    spots: Spot[];
  }>;

  clusterStyles: ClusterStyleLike[];
  clusterCalculator: (markers: unknown[], numStyles: number) => { text: string; index: number; title: string };

  markerIconForUser: () => google.maps.Icon;
  markerIconForVisibility: (
    visibility?: string | null,
    spot?: { date_start?: string | null; time_scale_out?: Spot["time_scale_out"] } | null,
    isSelected?: boolean,
    isPulsing?: boolean
  ) => google.maps.Icon;

  onMapClick: () => void;
  onSelectSpot: (spot: Spot) => void;

  crosshairPulseKey: number;

  addHref: string;
  isMobile: boolean;
  mobileListSnap: "peek" | "half" | "full";

  selectedSheetSnap: SpotSheetSnap;
  selectedSheetIsPeek: boolean;
  selectedSheetIsHalf: boolean;
  selectedSheetIsFull: boolean;
  selectedSheetHeightForSnap: () => number;
  spotSheetDragY: number;
  onSpotSheetTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void;
  onSpotSheetTouchMove: (e: React.TouchEvent<HTMLDivElement>) => void;
  onSpotSheetTouchEnd: () => void;
  cycleSelectedSheetSnap: () => void;
  onCloseSelected: () => void;

  spotSheetPeekMinHeight: number;
  selectedStoryParts: { intro: string; rest: string } | null;
  selectedStoryDate: string | null;
  selectedSourceBadge: string | null;
  selectedStoryPeriod: string | null;
  selectedVisibilityLabel: string | null;
  placeThroughTimeSpots: Spot[];
  placeThroughTimeEraLabel: (spot: Spot) => string;
  formatDistance: (meters: number) => string;
  formatStoryDate: (date?: string | null) => string | null;

  VisibilityBadge: React.ComponentType<{ visibility: SpotVisibility }>;
  TagPills: React.ComponentType<{ tags?: string[] | null; max?: number }>;
};

export default function MapView(props: MapViewProps) {
  const {
    pos,
    map,
    setMap,
    setMapCenter,
    setViewportRadiusM,
    setViewportBounds,
    setCrosshairPulseKey,
    selected,
    pulsingMarkerId,
    rankedFilteredSpots,
    shouldClusterMarkers,
    temporalClusterGroups,
    clusterStyles,
    clusterCalculator,
    markerIconForUser,
    markerIconForVisibility,
    onMapClick,
    onSelectSpot,
    crosshairPulseKey,
    addHref,
    isMobile,
    mobileListSnap,
    selectedSheetSnap,
    selectedSheetIsPeek,
    selectedSheetIsHalf,
    selectedSheetIsFull,
    selectedSheetHeightForSnap,
    spotSheetDragY,
    onSpotSheetTouchStart,
    onSpotSheetTouchMove,
    onSpotSheetTouchEnd,
    cycleSelectedSheetSnap,
    onCloseSelected,
    spotSheetPeekMinHeight,
    selectedStoryParts,
    selectedStoryDate,
    selectedSourceBadge,
    selectedStoryPeriod,
    selectedVisibilityLabel,
    placeThroughTimeSpots,
    placeThroughTimeEraLabel,
    formatDistance,
    formatStoryDate,
    VisibilityBadge,
    TagPills,
  } = props;

  return (
    <div className="ots-map">
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={pos}
        zoom={14}
        options={{ streetViewControl: false, mapTypeControl: false }}
        onLoad={(m) => {
          setMap(m);
          const c = m.getCenter();
          if (c) setMapCenter({ lat: c.lat(), lng: c.lng() });
          setViewportRadiusM(viewportRadiusFromMap(m));
          setViewportBounds(viewportBoundsFromMap(m));
        }}
        onIdle={() => {
          if (!map) return;
          const c = map.getCenter();
          if (c) setMapCenter({ lat: c.lat(), lng: c.lng() });
          setViewportRadiusM(viewportRadiusFromMap(map));
          setViewportBounds(viewportBoundsFromMap(map));
          setCrosshairPulseKey((k) => k + 1);
        }}
        onClick={onMapClick}
      >
        <MarkerF position={pos} title="You" icon={markerIconForUser()} zIndex={1100} />

        {shouldClusterMarkers ? (
          <>
            {temporalClusterGroups.map((group) => (
              <MarkerClustererF
                key={group.key}
                options={{
                  minimumClusterSize: 2,
                  gridSize: 48,
                  maxZoom: 15,
                  styles: clusterStyles,
                  clusterClass: "ots-map-cluster",
                  calculator: clusterCalculator,
                }}
              >
                {(clusterer) => (
                  <>
                    {group.spots.map((s) => (
                      <MarkerF
                        key={s.id}
                        clusterer={selected?.id === s.id ? undefined : clusterer}
                        position={{ lat: s.lat_out, lng: s.lng_out }}
                        title={s.title}
                        icon={markerIconForVisibility(
                          s.visibility,
                          s,
                          selected?.id === s.id,
                          pulsingMarkerId === s.id
                        )}
                        zIndex={selected?.id === s.id ? 1000 : undefined}
                        onClick={() => onSelectSpot(s)}
                      />
                    ))}
                  </>
                )}
              </MarkerClustererF>
            ))}
          </>
        ) : (
          rankedFilteredSpots.map((s) => (
            <MarkerF
              key={s.id}
              position={{ lat: s.lat_out, lng: s.lng_out }}
              title={s.title}
              icon={markerIconForVisibility(
                s.visibility,
                s,
                selected?.id === s.id,
                pulsingMarkerId === s.id
              )}
              zIndex={selected?.id === s.id ? 1000 : undefined}
              onClick={() => onSelectSpot(s)}
            />
          ))
        )}
      </GoogleMap>

      {!selected && (
        <div
          key={crosshairPulseKey}
          className="ots-crosshair ots-crosshair--pulse"
        />
      )}

      {selected && (
        <SpotSheet
          selected={selected}
          selectedSheetSnap={selectedSheetSnap}
          spotSheetDragY={spotSheetDragY}
          onTouchStart={onSpotSheetTouchStart}
          onTouchMove={onSpotSheetTouchMove}
          onTouchEnd={onSpotSheetTouchEnd}
          onCycleSnap={cycleSelectedSheetSnap}
          onClose={onCloseSelected}
          selectedSheetHeightForSnap={selectedSheetHeightForSnap}
          spotSheetPeekMinHeight={spotSheetPeekMinHeight}
          selectedStoryParts={selectedStoryParts}
          selectedStoryDate={selectedStoryDate}
          selectedSourceBadge={selectedSourceBadge}
          selectedStoryPeriod={selectedStoryPeriod}
          selectedVisibilityLabel={selectedVisibilityLabel}
          selectedSheetIsPeek={selectedSheetIsPeek}
          selectedSheetIsHalf={selectedSheetIsHalf}
          selectedSheetIsFull={selectedSheetIsFull}
          placeThroughTimeSpots={placeThroughTimeSpots}
          placeThroughTimeEraLabel={placeThroughTimeEraLabel}
          onSelectPlaceThroughTimeSpot={onSelectSpot}
          formatDistance={formatDistance}
          VisibilityBadge={VisibilityBadge}
          TagPills={TagPills}
          formatStoryDate={formatStoryDate}
        />
      )}

      <Link
        href={addHref}
        style={{
          position: "absolute",
          right: 16,
          bottom: selected
            ? selectedSheetSnap === "peek"
              ? 164
              : selectedSheetSnap === "half"
                ? "44vh"
                : "74vh"
            : isMobile
              ? mobileListSnap === "peek"
                ? 108
                : mobileListSnap === "half"
                  ? "42vh"
                  : "66vh"
              : 16,
          width: 56,
          height: 56,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#00dbc1",
          color: "#111",
          fontSize: 28,
          fontWeight: 900,
          textDecoration: "none",
          boxShadow: "0 10px 28px rgba(0,0,0,0.25)",
          zIndex: 50,
        }}
        title="Add Spot"
      >
        +
      </Link>
    </div>
  );
}