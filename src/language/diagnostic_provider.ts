import * as monaco from "monaco-editor";

import type { MarkerData, TextModel } from "../monacoTypes.ts";

/** 
 * The interface implemented by language services to integrate
 * with the diagnostic system
 */
export type DiagnosticProvider = {
    /** 
     * The owner ID for this diagnostic provider.
     *
     * Providers with different owner ID will not interfer with
     * each other's diagnostic markers
     */
    ownerId: string,

    /**
     * Callback for a new request to generate diagnostic markers.
     *
     * Return a seriers of DiagnosticTasks. The returned tasks
     * will be awaited in serial (in the order they are returned).
     * Once a task is finished, the markers will be updated based on
     * the `order` of the returned data.
     *
     * The host should decide how it wants to split up the tasks.
     * If it's cheap to perform analysis on the whole 
     */
    onNewRequest: (filename: string, model: TextModel, text: string, charPos: number) => Promise<DiagnosticTask[]>,
}

/** handle for part of a diagnostic request, known as a task */
export type DiagnosticTask = {
    /** 
     * Don't clear diagnostics with order strictly less than this number.
     *
     * If not set, all diagnostics lower than the new data will be cleared
     */
    fromOrder?: number;
    /** 
     * The order of this data. When updating the existing diagnostics,
     * all previous markers with order lower or equal to this will be replaced,
     * while those with a higher order will not be replaced. This is to
     * ensure partial results don't clear the parts of the text that aren't
     * processed, and previous results are still available to the user,
     * resulting in a better experience.
     *
     * The exact meaning of the number is up to each language service to implement
     */
    toOrder: number,
    /** 
     * The marker data included in this task
     *
     * if fromOrder is not set, this should also include all data from previous results.
     *
     * If undefined is returned, this response is ignored, and previous markers
     * won't be cleared. This can be used to indicate failure
     */
    data: Promise<MarkerData[] | undefined>,
};

/** Glue code to drive a provider whenever diagnostics needs to be updated */
class DiagnosticDriver {
    private provider: DiagnosticProvider;
    private cachedOrder: number[];
    private cachedData: MarkerData[];
    private serial: number;

    constructor(provider: DiagnosticProvider) {
        this.provider = provider;
        this.cachedOrder = [];
        this.cachedData = [];
        this.serial = 0;
    }

    public async updateMarkers(filename: string, model: TextModel, charPos: number): Promise<void> {
        const serial = this.getNewSerial();
        const activeText = model.getValue();
        // start a new request
        const tasks = await this.provider.onNewRequest(filename, model, activeText, charPos);
        if (serial !== this.serial || model.isDisposed()) {
            return;
        }

        const len = tasks.length;
        for (let i = 0; i < len; i++) {
            const { fromOrder, toOrder, data } = tasks[i];
            const dataAwaited = await data;
            if (serial !== this.serial || model.isDisposed()) {
                return;
            }
            if (!dataAwaited) {
                continue;
            }
            this.mergeData(dataAwaited, fromOrder, toOrder);
            monaco.editor.setModelMarkers(model, this.provider.ownerId, this.cachedData);
        }


    }

    private mergeData(data: MarkerData[], fromOrder: number | undefined, toOrder: number) {
        // if order >= clearMin, it will be cleared
        const clearMin = fromOrder === undefined ? Number.MIN_SAFE_INTEGER : fromOrder;
        // if order <= clearMax, it will be cleared
        const clearMax = toOrder;
    
        // binary search might be faster, we will just start
        // with linear search for now as it's probably sufficient
        const output = [];
        const outputOrder = [];
        const currentL = this.cachedData.length;
        for (let i = 0; i < currentL; i++) {
            const currentOrder = this.cachedOrder[i];
            if (currentOrder >= clearMin && currentOrder <= clearMax) {
                continue;
            }
            console.warn("preserving", this.cachedData[i], "order", currentOrder);
            output.push(this.cachedData[i]);
            outputOrder.push(currentOrder);
        }
        // add new ones
        const newL = data.length;
        for (let i = 0; i<newL;i++) {
            output.push(data[i]);
            outputOrder.push(toOrder);
        }
        this.cachedData = output;
        this.cachedOrder = outputOrder;
    }

    private getNewSerial() {
        this.serial++;
        if (this.serial === 500000) {
            this.serial = -500000;
        }
        return this.serial;
    }
}

/** Language ID to registered drivers */
const registry = new Map<string, DiagnosticDriver[]>();
export const registerDiagnosticProvider = (
    languageId: string,
    provider: DiagnosticProvider,
) => {
    const driver = new DiagnosticDriver(provider);
    const providers = registry.get(languageId);
    if (!providers) {
        registry.set(languageId, [driver]);
        return;
    }
    providers.push(driver);
}

/** 
 * Start a new provide marker request
 *
 * Awaiting on this will wait until markers are provided (or cancelled)
 * from all providers, which may not be what you want, since
 * that is usually non-blocking operation
 */
export const provideMarkers = async (filename: string, model: TextModel, charPos: number) => {
    const languageId = model.getLanguageId();
    const providers = registry.get(languageId);
    if (!providers) {
        return [];
    }
    const promises = providers.map((provider) => {
        return provider.updateMarkers(filename, model, charPos);
    });
    try {
        await Promise.all(promises);
    } catch(e) {
        console.error("one of the diagnostic provider errored.");
        console.error(e);
    }
};
