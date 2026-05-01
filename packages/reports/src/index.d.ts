import type { Report, ScanResult } from "@scaneur/types";

export declare const DEFAULT_DISCLAIMER: string;

export declare function toReport(scanResultOrReport: ScanResult | Report, options?: { disclaimer?: string }): Report;

export declare function renderMarkdownReport(scanResultOrReport: ScanResult | Report, options?: { disclaimer?: string }): string;

export declare function renderJsonReport(scanResultOrReport: ScanResult | Report, options?: { disclaimer?: string }): string;

export declare const renderJSONReport: typeof renderJsonReport;
