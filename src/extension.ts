/*
 * This file is released under the MIT license.
 * Copyright (c) 2016, 2017 Mike Lischke
 *
 * See LICENSE file for more info.
 */

'use strict';

import {
    workspace, languages, DiagnosticSeverity, ExtensionContext, Range, TextDocument, Diagnostic, TextDocumentChangeEvent,
    commands, Uri, window, TextEditorSelectionChangeEvent
} from 'vscode';

import { AntlrLanguageSupport, DiagnosticType } from "antlr4-graps";
let backend = new AntlrLanguageSupport();

import { HoverProvider } from '../src/HoverProvider';
import { DefinitionProvider } from '../src/DefinitionProvider';
import { SymbolProvider } from '../src/SymbolProvider';
import { AntlrCodeLensProvider } from '../src/CodeLensProvider';
import { AntlrCompletionItemProvider } from '../src/CompletionItemProvider';
import { AntlrRailroadDiagramProvider } from '../src/RailroadDiagramProvider';

let ANTLR = { language: 'antlr', scheme: 'file' };
let diagnosticCollection = languages.createDiagnosticCollection('antlr');

let DiagnosticTypeMap: Map<DiagnosticType, DiagnosticSeverity> = new Map();

export function activate(context: ExtensionContext) {

    DiagnosticTypeMap.set(DiagnosticType.Hint, DiagnosticSeverity.Hint);
    DiagnosticTypeMap.set(DiagnosticType.Info, DiagnosticSeverity.Information);
    DiagnosticTypeMap.set(DiagnosticType.Warning, DiagnosticSeverity.Warning);
    DiagnosticTypeMap.set(DiagnosticType.Error, DiagnosticSeverity.Error);

    context.subscriptions.push(languages.registerHoverProvider(ANTLR, new HoverProvider(backend)));
    context.subscriptions.push(languages.registerDefinitionProvider(ANTLR, new DefinitionProvider(backend)));
    context.subscriptions.push(languages.registerDocumentSymbolProvider(ANTLR, new SymbolProvider(backend)));
    context.subscriptions.push(languages.registerCodeLensProvider(ANTLR, new AntlrCodeLensProvider(backend)));
    //context.subscriptions.push(languages.registerCompletionItemProvider(ANTLR, new AntlrCompletionItemProvider(backend), " "));

    let diagramProvider = new AntlrRailroadDiagramProvider(backend);
    context.subscriptions.push(workspace.registerTextDocumentContentProvider("antlr", diagramProvider));

    let previewUri = Uri.parse('antlr://authority/railroad');

    let open = commands.registerTextEditorCommand('antlr.railroadDiagram', (te, t) => {
        return commands.executeCommand('vscode.previewHtml', previewUri, 2, "ANTLR Rule Railroad Diagram").then((success: boolean) => {
        }, (reason) => {
            window.showErrorMessage(reason);
        });
    });

    workspace.onDidOpenTextDocument((doc: TextDocument) => {
        if (doc.languageId == "antlr") {
            backend.loadGrammar(doc.fileName);
            processDiagnostic(doc);
        }
    })

    workspace.onDidCloseTextDocument((doc: TextDocument) => {
        if (doc.languageId === "antlr") {
            backend.releaseGrammar(doc.fileName);
        }
    })

    var changeTimeout: NodeJS.Timer | undefined;

    workspace.onDidChangeTextDocument((event: TextDocumentChangeEvent) => {
        if (event.document.languageId === "antlr") {
            if (changeTimeout) {
                clearTimeout(changeTimeout);
            }

            changeTimeout = setInterval(function () {
                clearTimeout(changeTimeout!);
                changeTimeout = undefined;
                backend.reparse(event.document.fileName, event.document.getText());
                processDiagnostic(event.document);

                if (event.document === window.activeTextEditor.document) {
                    diagramProvider.update(previewUri);
                }
            }, 500);
        }
    })

    window.onDidChangeTextEditorSelection((e: TextEditorSelectionChangeEvent) => {
        if (e.textEditor === window.activeTextEditor) {
            diagramProvider.update(previewUri);
        }
    })

    workspace.onDidChangeConfiguration(() => {
    })
}

export function deactivate() {
}

function processDiagnostic(document: TextDocument) {
    var diagnostics = [];
    let entries = backend.getDiagnostics(document.fileName);
    for (let entry of entries) {
        let range = new Range(entry.row - 1, entry.column, entry.row - 1, entry.column + entry.length);
        var diagnostic = new Diagnostic(range, entry.message, DiagnosticTypeMap.get(entry.type));
        //diagnostic.source = "ANTLR semantic check";
        diagnostics.push(diagnostic);
    }
    diagnosticCollection.set(document.uri, diagnostics);
}
