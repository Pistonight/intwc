import type {
    Range,
    CancellationToken,
    CompletionContext,
    CompletionItem,
    CompletionResult,
    LanguageConfiguration,
    LanguageTokenizer,
    MarkerResult,
    Position,
    SemanticTokensLegend,
    SemanticTokensResult,
    TextModel,
} from "../monacoTypes.ts";

import type { DiagnosticProvider } from "./diagnostic_provider.ts";

export type LanguageClient = {
    /** Get the language id */
    getId: () => string;
    getExtensions?: () => string[];
    /** Get the tokenizer to register on initialization */
    getTokenizer?: () => LanguageTokenizer;
    /** Get the configuration to register on initialization */
    getConfiguration?: () => LanguageConfiguration;

    /** Get diagnostic providers for this language */
    getDiagnosticProviders?: () => DiagnosticProvider[];


    /** Get the marker owners that `provideMarkers` will be called with */
    getMarkerOwners?: () => string[];
    /** Provide markers for the given model and owner */
    provideMarkers?: (model: TextModel, owner: string) => MarkerResult;

    getSemanticTokensLegend?: () => SemanticTokensLegend;

    provideDocumentRangeSemanticTokens?: (
        model: TextModel,
        range: Range,
        token: CancellationToken,
    ) => SemanticTokensResult;

    getCompletionTriggerCharacters?: () => string[];

    provideCompletionItems?: (
        model: TextModel,
        position: Position,
        context: CompletionContext,
        token: CancellationToken,
    ) => CompletionResult;

    resolveCompletionItem?: (
        item: CompletionItem,
        token: CancellationToken,
    ) => CompletionItem;
};
