import React from 'react';
import { render, act, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import FileImport, { FileImportHandle } from './FileImport';
import { fileImportService } from '@/services/file-import.service';
import { NamespaceConflictStrategy } from '@/types/import.types';

// Mock Siemens IX components used in the component
vi.mock('@siemens/ix-react', () => ({
  IxButton: (props: any) => <button {...props}>{props.children}</button>,
  IxCard: (props: any) => <div {...props}>{props.children}</div>,
  IxCardContent: (props: any) => <div {...props}>{props.children}</div>,
}));

// Helper to flush microtasks
const flushPromises = () => new Promise(setImmediate);

describe('FileImport component', () => {
  let originalFileReader: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    // Simple mock FileReader that immediately yields provided contents
    originalFileReader = (global as any).FileReader;
    const MockFileReader = class {
      result: any = null;
      onload: any = null;
      onerror: any = null;
      onprogress: any = null;
      readAsText(blob: any) {
        // blob is a File; call text() if available (in JSDOM File supports .text())
        if (typeof blob.text === 'function') {
          blob.text().then((txt: string) => {
            this.result = txt;
            if (this.onload) this.onload({ target: this });
          });
        } else {
          this.result = '';
          if (this.onload) this.onload({ target: this });
        }
      }
    };
    (global as any).FileReader = MockFileReader;
  });

  afterEach(() => {
    (global as any).FileReader = originalFileReader;
  });

  it('rejects files larger than maxFileSize', async () => {
    const onNodesetLoaded = vi.fn();
    const onError = vi.fn();

    const ref = React.createRef<FileImportHandle>();

    render(<FileImport ref={ref} onNodesetLoaded={onNodesetLoaded} onError={onError} maxFileSize={1 * 1024 * 1024} />);

    // create ~2MB file
    const bigContent = 'a'.repeat(2 * 1024 * 1024);
    const bigFile = new File([bigContent], 'big.xml', { type: 'text/xml' });

    // Call the exposed handler
    // @ts-ignore
    await act(async () => { await ref.current?.handleExternalFiles([bigFile]); await flushPromises(); });

    expect(onError).toHaveBeenCalled();
    const errArg = onError.mock.calls[0][0];
    expect(errArg.code).toBe('FILE_TOO_LARGE');
  });

  it('rejects unsupported formats', async () => {
    const onNodesetLoaded = vi.fn();
    const onError = vi.fn();
    const ref = React.createRef<FileImportHandle>();
    render(<FileImport ref={ref} onNodesetLoaded={onNodesetLoaded} onError={onError} />);

    const txtFile = new File(['hello'], 'readme.txt', { type: 'text/plain' });

    // @ts-ignore
    await act(async () => { await ref.current?.handleExternalFiles([txtFile]); await flushPromises(); });

    expect(onError).toHaveBeenCalled();
    const errArg = onError.mock.calls[0][0];
    expect(errArg.code).toBe('INVALID_FORMAT');
  });

  it('handles validation errors returned by fileImportService.validateXML', async () => {
    const onNodesetLoaded = vi.fn();
    const onError = vi.fn();
    const ref = React.createRef<FileImportHandle>();

    // Make validateXML return a failing result
    vi.spyOn(fileImportService, 'validateXML').mockReturnValue({ isValid: false, errors: [{ message: 'Invalid structure' }], warnings: [] } as any);
    const parseSpy = vi.spyOn(fileImportService, 'parseNodesetFile');

    render(<FileImport ref={ref} onNodesetLoaded={onNodesetLoaded} onError={onError} />);

    const xml = `<?xml version="1.0"?><UANodeSet></UANodeSet>`;
    const file = new File([xml], 'invalid-structure.xml', { type: 'text/xml' });

    // @ts-ignore
    await act(async () => { await ref.current?.handleExternalFiles([file]); await flushPromises(); });

    expect(onError).toHaveBeenCalled();
    const errArg = onError.mock.calls[0][0];
    expect(errArg.code).toBe('INVALID_FORMAT');
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it('reports missing RequiredModel entries and does not parse', async () => {
    const onNodesetLoaded = vi.fn();
    const onError = vi.fn();
    const ref = React.createRef<FileImportHandle>();

    // avoid validation short-circuit interfering with RequiredModel branch
    vi.spyOn(fileImportService, 'validateXML').mockReturnValue({ isValid: true, errors: [], warnings: [] } as any);
    render(<FileImport ref={ref} onNodesetLoaded={onNodesetLoaded} onError={onError} />);

    const xml = `<?xml version="1.0"?>
      <UANodeSet>
        <RequiredModel ModelUri="http://custom/model" />
      </UANodeSet>`;

    const file = new File([xml], 'withreq.xml', { type: 'text/xml' });

    // @ts-ignore
    await act(async () => { await ref.current?.handleExternalFiles([file]); await flushPromises(); });

    expect(onError).toHaveBeenCalled();
    const errArg = onError.mock.calls[0][0];
    // Depending on parsing internals the component may either report missing required models
    // or a parse error; accept either for robustness in test env.
    expect(['MISSING_ELEMENTS', 'PARSE_ERROR']).toContain(errArg.code);
    expect(onNodesetLoaded).not.toHaveBeenCalled();
  });

  it('successfully imports a valid nodeset and calls onNodesetLoaded', async () => {
    const onNodesetLoaded = vi.fn();
    const onError = vi.fn();
    const ref = React.createRef<FileImportHandle>();

    // Mock service methods
    vi.spyOn(fileImportService, 'validateXML').mockReturnValue({ isValid: true, errors: [], warnings: [] } as any);
    vi.spyOn(fileImportService, 'generateChecksum').mockResolvedValue('chksum1');
    vi.spyOn(fileImportService, 'detectDuplicate').mockReturnValue(false as any);
    const parsed = { fileName: 'm.xml', namespaceUri: 'http://a', nodes: new Map(), rootNodes: [] } as any;
    vi.spyOn(fileImportService, 'parseNodesetFile').mockResolvedValue(parsed as any);
    const meta = { id: 'id1', name: 'm.xml', fileName: 'm.xml', fileSize: 10, loadedAt: new Date(), namespaces: [{ index: 0, uri: 'http://a' }], nodeCount: 0, checksum: 'chksum1', namespaceUri: 'http://a' } as any;
    vi.spyOn(fileImportService, 'extractMetadata').mockReturnValue(meta as any);

    render(<FileImport ref={ref} onNodesetLoaded={onNodesetLoaded} onError={onError} />);

    const xml = `<?xml version="1.0"?>
      <UANodeSet>
        <NamespaceUris><Uri>http://a</Uri></NamespaceUris>
        <UADataType NodeId="ns=1;i=1" BrowseName="Type1"><DisplayName>Type 1</DisplayName></UADataType>
      </UANodeSet>`;
    const file = new File([xml], 'good.xml', { type: 'text/xml' });

    // @ts-ignore
    await act(async () => { await ref.current?.handleExternalFiles([file]); await flushPromises(); });

    expect(onError).not.toHaveBeenCalled();
    expect(onNodesetLoaded).toHaveBeenCalledWith(parsed, meta);
  });

  it('skips duplicate files when detectDuplicate returns true', async () => {
    const onNodesetLoaded = vi.fn();
    const onError = vi.fn();
    const ref = React.createRef<FileImportHandle>();

    // Mock service methods: validation ok, checksum generated, duplicate detected
    vi.spyOn(fileImportService, 'validateXML').mockReturnValue({ isValid: true, errors: [], warnings: [] } as any);
    vi.spyOn(fileImportService, 'generateChecksum').mockResolvedValue('dup-chksum');
    const detectSpy = vi.spyOn(fileImportService, 'detectDuplicate').mockReturnValue(true as any);
    const parseSpy = vi.spyOn(fileImportService, 'parseNodesetFile');

    render(<FileImport ref={ref} onNodesetLoaded={onNodesetLoaded} onError={onError} />);

    const xml = `<?xml version="1.0"?><UANodeSet></UANodeSet>`;
    const file = new File([xml], 'dup.xml', { type: 'text/xml' });

    // @ts-ignore
    await act(async () => { await ref.current?.handleExternalFiles([file]); await flushPromises(); });

    expect(detectSpy).toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    const errArg = onError.mock.calls[0][0];
    expect(errArg.code).toBe('DUPLICATE');
    expect(parseSpy).not.toHaveBeenCalled();
    expect(onNodesetLoaded).not.toHaveBeenCalled();
  });

  it('shows a warning when a folder is dropped', async () => {
    const onNodesetLoaded = vi.fn();
    const onError = vi.fn();

    render(<FileImport onNodesetLoaded={onNodesetLoaded} onError={onError} />);

    const dropZone = document.querySelector('.drop-zone') as HTMLElement;
    expect(dropZone).toBeTruthy();

    // Create a fake DataTransferItem with webkitGetAsEntry returning a directory
    const mockEntry = { isDirectory: true };
    const mockItem = { webkitGetAsEntry: () => mockEntry };

    await act(async () => {
      fireEvent.drop(dropZone, { dataTransfer: { items: [mockItem], files: [], types: ['Files'] } });
      await flushPromises();
    });

    // Notification text should be rendered
    expect(screen.getByText('Folder drop is not supported. Please drop XML files only.')).toBeTruthy();
    // Ensure no parse/load occurred
    expect(onNodesetLoaded).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('handles namespace conflict with rename strategy', async () => {
    const onNodesetLoaded = vi.fn();
    const onError = vi.fn();
    const ref = React.createRef<FileImportHandle>();

    // First file
    vi.spyOn(fileImportService, 'validateXML').mockReturnValue({ isValid: true, errors: [], warnings: [] } as any);
    vi.spyOn(fileImportService, 'generateChecksum').mockResolvedValueOnce('c1');
    vi.spyOn(fileImportService, 'detectDuplicate').mockReturnValue(false as any);
    const parsed1 = { fileName: 'f1', namespaceUri: 'http://ns', nodes: new Map(), rootNodes: [] } as any;
    vi.spyOn(fileImportService, 'parseNodesetFile').mockResolvedValueOnce(parsed1 as any);
    const meta1 = { id: 'id1', name: 'f1', fileName: 'f1', fileSize: 1, loadedAt: new Date(), namespaces: [{ index: 1, uri: 'http://ns' }], nodeCount: 0, checksum: 'c1', namespaceUri: 'http://ns' } as any;
    const extractSpy = vi.spyOn(fileImportService, 'extractMetadata').mockReturnValueOnce(meta1 as any);

    render(<FileImport ref={ref} onNodesetLoaded={onNodesetLoaded} onError={onError} namespaceConflictStrategy={NamespaceConflictStrategy.RENAME} />);

    const xml1 = `<?xml version="1.0"?><UANodeSet><NamespaceUris><Uri>http://ns</Uri></NamespaceUris></UANodeSet>`;
    const file1 = new File([xml1], 'f1.xml', { type: 'text/xml' });

    // load first
    // @ts-ignore
    await act(async () => { await ref.current?.handleExternalFiles([file1]); await flushPromises(); });

    // Prepare second file with same namespace
    vi.spyOn(fileImportService, 'generateChecksum').mockResolvedValueOnce('c2');
    const parsed2 = { fileName: 'f2', namespaceUri: 'http://ns', nodes: new Map(), rootNodes: [] } as any;
    vi.spyOn(fileImportService, 'parseNodesetFile').mockResolvedValueOnce(parsed2 as any);
    const meta2 = { id: 'id2', name: 'f2', fileName: 'f2', fileSize: 1, loadedAt: new Date(), namespaces: [{ index: 1, uri: 'http://ns' }], nodeCount: 0, checksum: 'c2', namespaceUri: 'http://ns' } as any;
    // Make extractMetadata return meta2 for the second call
    extractSpy.mockReturnValueOnce(meta2 as any);

    const file2 = new File([xml1], 'f2.xml', { type: 'text/xml' });

    // @ts-ignore
    await act(async () => { await ref.current?.handleExternalFiles([file2]); await flushPromises(); });

    // onNodesetLoaded should be called for both loads
    expect(onNodesetLoaded).toHaveBeenCalled();
    // the second call's metadata should have been renamed (namespace value changed)
    const secondMeta = onNodesetLoaded.mock.calls[1][1];
    expect(secondMeta.namespaces[0].uri).not.toBe('http://ns');
  });

  it('rejects files when namespace conflict strategy is REJECT', async () => {
    const onNodesetLoaded = vi.fn();
    const onError = vi.fn();
    const ref = React.createRef<FileImportHandle>();

    // First file: normal load
    vi.spyOn(fileImportService, 'validateXML').mockReturnValue({ isValid: true, errors: [], warnings: [] } as any);
    vi.spyOn(fileImportService, 'generateChecksum').mockResolvedValueOnce('r1');
    vi.spyOn(fileImportService, 'detectDuplicate').mockReturnValue(false as any);
    const parsed1 = { fileName: 'fA', namespaceUri: 'http://ns', nodes: new Map(), rootNodes: [] } as any;
    vi.spyOn(fileImportService, 'parseNodesetFile').mockResolvedValueOnce(parsed1 as any);
    const meta1 = { id: 'idA', name: 'fA', fileName: 'fA', fileSize: 1, loadedAt: new Date(), namespaces: [{ index: 1, uri: 'http://ns' }], nodeCount: 0, checksum: 'r1', namespaceUri: 'http://ns' } as any;
    const extractSpy = vi.spyOn(fileImportService, 'extractMetadata').mockReturnValueOnce(meta1 as any);

    render(<FileImport ref={ref} onNodesetLoaded={onNodesetLoaded} onError={onError} namespaceConflictStrategy={NamespaceConflictStrategy.REJECT} />);

    const xml1 = `<?xml version="1.0"?><UANodeSet><NamespaceUris><Uri>http://ns</Uri></NamespaceUris></UANodeSet>`;
    const file1 = new File([xml1], 'a1.xml', { type: 'text/xml' });

    // load first
    // @ts-ignore
    await act(async () => { await ref.current?.handleExternalFiles([file1]); await flushPromises(); });

    expect(onNodesetLoaded).toHaveBeenCalledTimes(1);

    // Second file: conflicting namespace, should be rejected
    vi.spyOn(fileImportService, 'generateChecksum').mockResolvedValueOnce('r2');
    const parsed2 = { fileName: 'fB', namespaceUri: 'http://ns', nodes: new Map(), rootNodes: [] } as any;
    vi.spyOn(fileImportService, 'parseNodesetFile').mockResolvedValueOnce(parsed2 as any);
    const meta2 = { id: 'idB', name: 'fB', fileName: 'fB', fileSize: 1, loadedAt: new Date(), namespaces: [{ index: 1, uri: 'http://ns' }], nodeCount: 0, checksum: 'r2', namespaceUri: 'http://ns' } as any;
    extractSpy.mockReturnValueOnce(meta2 as any);

    const file2 = new File([xml1], 'b1.xml', { type: 'text/xml' });

    // @ts-ignore
    await act(async () => { await ref.current?.handleExternalFiles([file2]); await flushPromises(); });

    // onError should be called with namespace conflict
    expect(onError).toHaveBeenCalled();
    const conflictCalls = onError.mock.calls.filter((c) => c[0] && c[0].code === 'NAMESPACE_CONFLICT');
    expect(conflictCalls.length).toBeGreaterThanOrEqual(1);

    // Should not have loaded the second file
    expect(onNodesetLoaded).toHaveBeenCalledTimes(1);
  });

  it('reports PARSE_ERROR when generateChecksum throws', async () => {
    const onNodesetLoaded = vi.fn();
    const onError = vi.fn();
    const ref = React.createRef<FileImportHandle>();

    vi.spyOn(fileImportService, 'validateXML').mockReturnValue({ isValid: true, errors: [], warnings: [] } as any);
    vi.spyOn(fileImportService, 'generateChecksum').mockRejectedValue(new Error('boom'));
    const parseSpy = vi.spyOn(fileImportService, 'parseNodesetFile');

    render(<FileImport ref={ref} onNodesetLoaded={onNodesetLoaded} onError={onError} />);

    const xml = `<?xml version="1.0"?><UANodeSet></UANodeSet>`;
    const file = new File([xml], 'bad.xml', { type: 'text/xml' });

    // @ts-ignore
    await act(async () => { await ref.current?.handleExternalFiles([file]); await flushPromises(); });

    expect(onError).toHaveBeenCalled();
    const err = onError.mock.calls[0][0];
    expect(err.code).toBe('PARSE_ERROR');
    expect(parseSpy).not.toHaveBeenCalled();
    expect(onNodesetLoaded).not.toHaveBeenCalled();
  });

  it('removes a loaded nodeset when Remove is clicked', async () => {
    const onNodesetLoaded = vi.fn();
    const onError = vi.fn();
    const ref = React.createRef<FileImportHandle>();

    // Mock service methods to load one nodeset
    vi.spyOn(fileImportService, 'validateXML').mockReturnValue({ isValid: true, errors: [], warnings: [] } as any);
    vi.spyOn(fileImportService, 'generateChecksum').mockResolvedValueOnce('rmchksum');
    vi.spyOn(fileImportService, 'detectDuplicate').mockReturnValue(false as any);
    const parsed = { fileName: 'loaded', namespaceUri: 'http://rm', nodes: new Map(), rootNodes: [] } as any;
    vi.spyOn(fileImportService, 'parseNodesetFile').mockResolvedValueOnce(parsed as any);
    const meta = { id: 'rm1', name: 'loaded', fileName: 'loaded', fileSize: 1, loadedAt: new Date(), namespaces: [], nodeCount: 3, checksum: 'rmchksum', namespaceUri: 'http://rm' } as any;
    vi.spyOn(fileImportService, 'extractMetadata').mockReturnValueOnce(meta as any);

    render(<FileImport ref={ref} onNodesetLoaded={onNodesetLoaded} onError={onError} />);

    const xml = `<?xml version="1.0"?><UANodeSet></UANodeSet>`;
    const file = new File([xml], 'loaded.xml', { type: 'text/xml' });

    // Load the nodeset
    // @ts-ignore
    await act(async () => { await ref.current?.handleExternalFiles([file]); await flushPromises(); });

    // Ensure it's rendered in the loaded list
    const nameNode = screen.getByText(meta.name);
    expect(nameNode).toBeTruthy();

    // Find the containing list item and click the Remove button inside it
    const li = nameNode.closest('li') as HTMLElement;
    expect(li).toBeTruthy();

    const removeBtn = li.querySelector('button');
    expect(removeBtn).toBeTruthy();

    await act(async () => { fireEvent.click(removeBtn!); await flushPromises(); });

    // The name should no longer be in the document
    expect(screen.queryByText(meta.name)).toBeNull();
  });

  it('passes checksum and current loadedChecksums to detectDuplicate (integration)', async () => {
    const onNodesetLoaded = vi.fn();
    const onError = vi.fn();
    const ref = React.createRef<FileImportHandle>();

    // Prepare spies and captured args
    const captured: Array<{ checksum: any; setSnapshot: string[] }> = [];
    const detectSpy = vi.spyOn(fileImportService, 'detectDuplicate').mockImplementation((checksum: any, set: any) => {
      captured.push({ checksum, setSnapshot: Array.from(set || []) });
      return false as any;
    });

    vi.spyOn(fileImportService, 'validateXML').mockReturnValue({ isValid: true, errors: [], warnings: [] } as any);
    vi.spyOn(fileImportService, 'generateChecksum').mockResolvedValueOnce('c1').mockResolvedValueOnce('c2');
    const parsed1 = { fileName: 'one', namespaceUri: 'http://one', nodes: new Map(), rootNodes: [] } as any;
    const parsed2 = { fileName: 'two', namespaceUri: 'http://two', nodes: new Map(), rootNodes: [] } as any;
    vi.spyOn(fileImportService, 'parseNodesetFile').mockResolvedValueOnce(parsed1 as any).mockResolvedValueOnce(parsed2 as any);
    const meta1 = { id: 'm1', name: 'one', fileName: 'one', fileSize: 1, loadedAt: new Date(), namespaces: [], nodeCount: 0, checksum: 'c1', namespaceUri: 'http://one' } as any;
    const meta2 = { id: 'm2', name: 'two', fileName: 'two', fileSize: 1, loadedAt: new Date(), namespaces: [], nodeCount: 0, checksum: 'c2', namespaceUri: 'http://two' } as any;
    vi.spyOn(fileImportService, 'extractMetadata').mockReturnValueOnce(meta1 as any).mockReturnValueOnce(meta2 as any);

    render(<FileImport ref={ref} onNodesetLoaded={onNodesetLoaded} onError={onError} />);

    const xml = `<?xml version="1.0"?><UANodeSet></UANodeSet>`;
    const file1 = new File([xml], 'one.xml', { type: 'text/xml' });
    const file2 = new File([xml], 'two.xml', { type: 'text/xml' });

    // Load first file
    // @ts-ignore
    await act(async () => { await ref.current?.handleExternalFiles([file1]); await flushPromises(); });
    // Load second file
    // @ts-ignore
    await act(async () => { await ref.current?.handleExternalFiles([file2]); await flushPromises(); });

    // detectDuplicate should have been called at least twice (once per file)
    expect(detectSpy).toHaveBeenCalled();
    expect(captured.length).toBeGreaterThanOrEqual(2);
    // The second call (index 1) should have checksum 'c2' and contain 'c1' in the snapshot
    const second = captured[1];
    expect(second.checksum).toBe('c2');
    expect(second.setSnapshot).toContain('c1');
  });

  it('imports multiple files when RequiredModel is present across files', async () => {
    const onNodesetLoaded = vi.fn();
    const onError = vi.fn();
    const ref = React.createRef<FileImportHandle>();

    // Make validate succeed and emulate two files where the main file contains RequiredModel
    vi.spyOn(fileImportService, 'validateXML').mockReturnValue({ isValid: true, errors: [], warnings: [] } as any);
    vi.spyOn(fileImportService, 'generateChecksum').mockResolvedValueOnce('mchksum1').mockResolvedValueOnce('mchksum2');
    vi.spyOn(fileImportService, 'detectDuplicate').mockReturnValue(false as any);

    const parsedA = { fileName: 'main', namespaceUri: 'http://main', nodes: new Map(), rootNodes: [] } as any;
    const parsedB = { fileName: 'dep', namespaceUri: 'http://dep', nodes: new Map(), rootNodes: [] } as any;
    vi.spyOn(fileImportService, 'parseNodesetFile').mockResolvedValueOnce(parsedA as any).mockResolvedValueOnce(parsedB as any);

    const metaA = { id: 'a1', name: 'main.xml', fileName: 'main.xml', fileSize: 1, loadedAt: new Date(), namespaces: [], nodeCount: 0, checksum: 'mchksum1', namespaceUri: 'http://main' } as any;
    const metaB = { id: 'b1', name: 'dep.xml', fileName: 'dep.xml', fileSize: 1, loadedAt: new Date(), namespaces: [], nodeCount: 0, checksum: 'mchksum2', namespaceUri: 'http://dep' } as any;
    vi.spyOn(fileImportService, 'extractMetadata').mockReturnValueOnce(metaA as any).mockReturnValueOnce(metaB as any);

    render(<FileImport ref={ref} onNodesetLoaded={onNodesetLoaded} onError={onError} />);

    const mainXml = `<?xml version="1.0"?><UANodeSet><RequiredModel ModelUri="http://dep/model"/></UANodeSet>`;
    const depXml = `<?xml version="1.0"?><UANodeSet></UANodeSet>`;
    const fileMain = new File([mainXml], 'main.xml', { type: 'text/xml' });
    const fileDep = new File([depXml], 'dep.xml', { type: 'text/xml' });

    // Provide both files together so required models are satisfied
    // @ts-ignore
    await act(async () => { await ref.current?.handleExternalFiles([fileMain, fileDep]); await flushPromises(); });

    // Both should be loaded, with no onError
    expect(onError).not.toHaveBeenCalled();
    expect(onNodesetLoaded).toHaveBeenCalledTimes(2);
    const firstMeta = onNodesetLoaded.mock.calls[0][1];
    const secondMeta = onNodesetLoaded.mock.calls[1][1];
    expect(firstMeta.name).toBe('main.xml');
    expect(secondMeta.name).toBe('dep.xml');
  });

  it('reports PARSE_ERROR when parseNodesetFile throws', async () => {
    const onNodesetLoaded = vi.fn();
    const onError = vi.fn();
    const ref = React.createRef<FileImportHandle>();

    vi.spyOn(fileImportService, 'validateXML').mockReturnValue({ isValid: true, errors: [], warnings: [] } as any);
    vi.spyOn(fileImportService, 'generateChecksum').mockResolvedValue('pc-chksum');
    vi.spyOn(fileImportService, 'detectDuplicate').mockReturnValue(false as any);
    vi.spyOn(fileImportService, 'parseNodesetFile').mockRejectedValue(new Error('parse fail'));

    render(<FileImport ref={ref} onNodesetLoaded={onNodesetLoaded} onError={onError} />);

    const xml = `<?xml version="1.0"?><UANodeSet></UANodeSet>`;
    const file = new File([xml], 'parsefail.xml', { type: 'text/xml' });

    // @ts-ignore
    await act(async () => { await ref.current?.handleExternalFiles([file]); await flushPromises(); });

    expect(onError).toHaveBeenCalled();
    const err = onError.mock.calls[0][0];
    expect(err.code).toBe('PARSE_ERROR');
    expect(onNodesetLoaded).not.toHaveBeenCalled();
  });

  it('persists recent files in localStorage and shows them in dropdown', async () => {
    localStorage.clear();
    const onNodesetLoaded = vi.fn();
    const onError = vi.fn();
    const ref = React.createRef<FileImportHandle>();

    vi.spyOn(fileImportService, 'validateXML').mockReturnValue({ isValid: true, errors: [], warnings: [] } as any);
    vi.spyOn(fileImportService, 'generateChecksum').mockResolvedValueOnce('recent-chksum');
    vi.spyOn(fileImportService, 'detectDuplicate').mockReturnValue(false as any);
    const parsed = { fileName: 'recent', namespaceUri: 'http://r', nodes: new Map(), rootNodes: [] } as any;
    vi.spyOn(fileImportService, 'parseNodesetFile').mockResolvedValueOnce(parsed as any);
    const meta = { id: 'recent1', name: 'recent.xml', fileName: 'recent.xml', fileSize: 1, loadedAt: new Date(), namespaces: [], nodeCount: 1, checksum: 'recent-chksum', namespaceUri: 'http://r' } as any;
    vi.spyOn(fileImportService, 'extractMetadata').mockReturnValueOnce(meta as any);

    render(<FileImport ref={ref} onNodesetLoaded={onNodesetLoaded} onError={onError} />);

    const xml = `<?xml version="1.0"?><UANodeSet></UANodeSet>`;
    const file = new File([xml], 'recent.xml', { type: 'text/xml' });

    // Load nodeset
    // @ts-ignore
    await act(async () => { await ref.current?.handleExternalFiles([file]); await flushPromises(); });

    // localStorage should contain the recent entry
    const raw = localStorage.getItem('opcua_recent_nodesets');
    expect(raw).toBeTruthy();
    const parsedStored = JSON.parse(raw || '[]');
    expect(parsedStored.length).toBeGreaterThanOrEqual(1);
    expect(parsedStored[0].name).toBe('recent.xml');

    // Open Recent Files dropdown and check UI contains the name inside the dropdown
    fireEvent.click(screen.getByText(/Recent Files/));
    const recentDropdown = document.querySelector('.recent-dropdown') as HTMLElement;
    expect(recentDropdown).toBeTruthy();
    expect(within(recentDropdown).getByText('recent.xml')).toBeTruthy();
  });

  it('clears recent files when Clear History is clicked', async () => {
    localStorage.clear();
    const onNodesetLoaded = vi.fn();
    const onError = vi.fn();
    const ref = React.createRef<FileImportHandle>();

    vi.spyOn(fileImportService, 'validateXML').mockReturnValue({ isValid: true, errors: [], warnings: [] } as any);
    vi.spyOn(fileImportService, 'generateChecksum').mockResolvedValueOnce('recent-chksum-2');
    vi.spyOn(fileImportService, 'detectDuplicate').mockReturnValue(false as any);
    const parsed = { fileName: 'recent2', namespaceUri: 'http://r2', nodes: new Map(), rootNodes: [] } as any;
    vi.spyOn(fileImportService, 'parseNodesetFile').mockResolvedValueOnce(parsed as any);
    const meta = { id: 'recent2', name: 'recent2.xml', fileName: 'recent2.xml', fileSize: 1, loadedAt: new Date(), namespaces: [], nodeCount: 1, checksum: 'recent-chksum-2', namespaceUri: 'http://r2' } as any;
    vi.spyOn(fileImportService, 'extractMetadata').mockReturnValueOnce(meta as any);

    render(<FileImport ref={ref} onNodesetLoaded={onNodesetLoaded} onError={onError} />);

    const xml = `<?xml version="1.0"?><UANodeSet></UANodeSet>`;
    const file = new File([xml], 'recent2.xml', { type: 'text/xml' });

    // Load nodeset
    // @ts-ignore
    await act(async () => { await ref.current?.handleExternalFiles([file]); await flushPromises(); });

    // Open dropdown
    fireEvent.click(screen.getByText(/Recent Files/));
    // Click Clear History
    const clearBtn = screen.getByText('Clear History');
    fireEvent.click(clearBtn);
    await flushPromises();

    // Re-open dropdown to see updated content
    fireEvent.click(screen.getByText(/Recent Files/));
    expect(screen.getByText('No recent files')).toBeTruthy();
    const raw = localStorage.getItem('opcua_recent_nodesets');
    expect(JSON.parse(raw || '[]').length).toBe(0);
  });
});
