import * as monaco from "monaco-editor";

import { initPreference } from "./preference.ts";
import type { InitOption } from "./types.ts";
import { initThemes } from "./theme";
import { patchMonacoTypeScript } from "./typescript";
import { registerMarkerProvider } from "./language/MarkerProviderRegistry.ts";
import { setEditorOptions } from "./EditorState.ts";

export function initCodeEditor({
    preferences,
    language,
    editor,
    theme,
}: InitOption) {
    initPreference(preferences || {});

    const { typescript, custom } = language || {};

    initThemes(theme || {});

    // initialize TypeScript options
    if (typescript) {
        if (!import.meta.env.INTWC_TYPESCRIPT) {
            console.warn(
                "[intwc] TypeScript init options are set, but TypeScript is not loaded using intwc plugin!!!",
            );
        } else {
            const dom = typescript.dom ?? true;
            monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
                target: monaco.languages.typescript.ScriptTarget.ESNext,
                lib: dom ? undefined : ["esnext"],
                noEmit: true,
                strict: true,
                // jsx: "preserve",
                noUnusedLocals: true,
                noUnusedParameters: true,
                noFallthroughCasesInSwitch: true,
            });

            if (typescript.extraLibs) {
                typescript.extraLibs.forEach((lib) => {
                    monaco.languages.typescript.typescriptDefaults.addExtraLib(
                        lib.content,
                        `file:///_lib_${lib.name}.ts`,
                    );
                });
            }

            patchMonacoTypeScript({
                semanticTokensMaxLength: -1,
            });
        }
    }

    if (custom) {
        custom.forEach((client) => {
            const id = client.getId();
            monaco.languages.register({
                id,
                extensions: client.getExtensions?.(),
            });
            const tokenizer = client.getTokenizer?.();
            if (tokenizer) {
                monaco.languages.registerTokensProviderFactory(id, {
                    create: () => tokenizer,
                });
                // monaco.languages.setMonarchTokensProvider(id, tokenizer);
            }
            const configuration = client.getConfiguration?.();
            if (configuration) {
                monaco.languages.setLanguageConfiguration(id, configuration);
            }

            const getLegend = client.getSemanticTokensLegend?.bind(client);
            const provideDocumentRangeSemanticTokens =
                client.provideDocumentRangeSemanticTokens?.bind(client);

            if (getLegend && provideDocumentRangeSemanticTokens) {
                monaco.languages.registerDocumentRangeSemanticTokensProvider(
                    id,
                    {
                        getLegend,
                        provideDocumentRangeSemanticTokens,
                    },
                );
            } else if (getLegend || provideDocumentRangeSemanticTokens) {
                console.warn(
                    `[intwc] semantic token provider for "${id}" is not registered. You need both getSemanticTokensLegend and provideDocumentRangeSemanticTokens`,
                );
            }

            const provideMarkers = client.provideMarkers?.bind(client);
            const markerOwners = client.getMarkerOwners?.();
            if (provideMarkers && markerOwners) {
                markerOwners.forEach((owner) => {
                    registerMarkerProvider(id, {
                        owner,
                        provide: (model) => provideMarkers(model, owner),
                    });
                });
                // note: the provider invocation is registered
                // in EditorState using the onDidChangeContent event
            }

            const provideCompletionItems =
                client.provideCompletionItems?.bind(client);
            if (provideCompletionItems) {
                const completionTriggerCharacters =
                    client.getCompletionTriggerCharacters?.();
                const resolveCompletionItem =
                    client.resolveCompletionItem?.bind(client);
                monaco.languages.registerCompletionItemProvider(id, {
                    triggerCharacters: completionTriggerCharacters,
                    provideCompletionItems,
                    resolveCompletionItem,
                });
            }
        });
    }

    if (editor) {
        setEditorOptions(editor);
    }
}
