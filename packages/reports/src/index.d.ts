import type { Report, ScanResult } from "@scaneur/types";

export declare const DEFAULT_DISCLAIMER: string;

export declare function toReport(scanResultOrReport: ScanResult | Report, options?: { disclaimer?: string }): Report;

export declare function renderMarkdownReport(scanResultOrReport: ScanResult | Report, options?: { disclaimer?: string }): string;
