import {
  toGrantConversionSnapshot,
  type GrantConversion,
} from "@create-audiobook-from-url/conversion-grants";
import type { ConversionDetail } from "@create-audiobook-from-url/web-app-api.routes";

export type GetGrantConversionDependencies = {
  getConversion(conversionId: string): Promise<GrantConversion | undefined>;
};

export async function getGrantConversion(
  conversionId: string,
  dependencies: GetGrantConversionDependencies,
): Promise<ConversionDetail | undefined> {
  const conversion = await dependencies.getConversion(conversionId);
  if (conversion === undefined) return undefined;
  const snapshot = toGrantConversionSnapshot(conversion);
  if (snapshot.status !== "pending") return snapshot;
  return { ...snapshot, lastStartedPhase: conversion.lastStartedPhase };
}
