import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Siemens IX components to simple HTML elements for testing
vi.mock('@siemens/ix-react', () => ({
  IxButton: (props: any) => {
    const { ghost, outline, size, icon, children, ...rest } = props;
    return <button {...rest}>{children}</button>;
  },
  IxCard: (props: any) => <div {...props}>{props.children}</div>,
  IxCardContent: (props: any) => <div {...props}>{props.children}</div>,
  IxIcon: (props: any) => <span {...props}>{props.name}</span>,
  IxIconButton: (props: any) => {
    const { ghost, size, icon, ...rest } = props;
    return <button {...rest}>{props.children}</button>;
  },
}));

vi.mock('@siemens/ix-icons/icons', () => ({
  iconCopy: 'iconCopy',
  iconChevronDown: 'iconChevronDown',
  iconChevronRight: 'iconChevronRight',
}));

import DetailPanel from './DetailPanel';

describe('DetailPanel component', () => {
  beforeEach(() => {
    // Ensure clipboard mock
    if (!('clipboard' in navigator)) {
      // @ts-ignore
      navigator.clipboard = { writeText: vi.fn() };
    } else {
      vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(vi.fn() as any);
    }
  });

  it('shows empty state when no node selected', () => {
    render(<DetailPanel selectedNode={null} nodesetData={{ nodes: new Map() } as any} onNodeSelect={() => {}} />);
    expect(screen.getByText('No Node Selected')).toBeDefined();
  });

  it('renders basic properties and copies NodeId', () => {
    const node = {
      nodeId: 'ns=1;i=10',
      displayName: 'My Node',
      browseName: 'MyNode',
      nodeClass: 'Object',
      description: 'A node',
      references: [],
      children: [],
    } as any;

    const nodes = new Map<string, any>([['ns=1;i=10', node]]);

    render(<DetailPanel selectedNode={node} nodesetData={{ nodes } as any} onNodeSelect={() => {}} />);

    expect(screen.getByText('My Node')).toBeDefined();
    expect(screen.getByText('NodeId')).toBeDefined();
    // Click header Copy NodeId button (first button with "Copy NodeId" text)
    const copyButton = screen.getByText('Copy NodeId');
    fireEvent.click(copyButton);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ns=1;i=10');
  });

  it('displays valueRank mappings', () => {
    const node = {
      nodeId: 'ns=1;i=11',
      displayName: 'VR Node',
      browseName: 'VRNode',
      nodeClass: 'Variable',
      valueRank: -1,
      references: [],
      children: [],
    } as any;

    const nodes = new Map<string, any>([['ns=1;i=11', node]]);
    render(<DetailPanel selectedNode={node} nodesetData={{ nodes } as any} onNodeSelect={() => {}} />);

    expect(screen.getByText('-1 (Scalar)')).toBeDefined();
  });

  it('lists references and handles clicks for existing targets', () => {
    const child = { nodeId: 'ns=1;i=20', displayName: 'Child', nodeClass: 'Object', references: [], children: [] } as any;
    const node = {
      nodeId: 'ns=1;i=19',
      displayName: 'ParentNode',
      nodeClass: 'Object',
      references: [
        { referenceType: 'HasComponent', isForward: true, targetNodeId: 'ns=1;i=20' },
        { referenceType: 'HasProperty', isForward: true, targetNodeId: 'ns=1;i=21' },
      ],
      children: [child],
    } as any;

    const nodes = new Map<string, any>([['ns=1;i=19', node], ['ns=1;i=20', child]]);

    const onNodeSelect = vi.fn();

    render(<DetailPanel selectedNode={node} nodesetData={{ nodes } as any} onNodeSelect={onNodeSelect} />);

    // existing target should be clickable
    const childButton = screen.getByRole('button', { name: /Child/i });
    expect(childButton).toBeEnabled();
    fireEvent.click(childButton);
    expect(onNodeSelect).toHaveBeenCalledWith(child);

    // missing target should render disabled button (find by title)
    expect(screen.getByTitle('ns=1;i=21')).toBeDisabled();
  });

  it('shows hierarchy items and allows selecting parent/type/base', () => {
    const parent = { nodeId: 'ns=1;i=30', displayName: 'Parent', nodeClass: 'Object', references: [], children: [] } as any;
    const typeDef = { nodeId: 'ns=1;i=31', displayName: 'TypeDef', nodeClass: 'ObjectType', references: [], children: [] } as any;
    const baseType = { nodeId: 'ns=1;i=32', displayName: 'BaseType', nodeClass: 'ObjectType', references: [], children: [] } as any;

    const node = {
      nodeId: 'ns=1;i=33',
      displayName: 'ChildNode',
      nodeClass: 'Object',
      references: [
        { referenceType: 'HasComponent', isForward: false, targetNodeId: 'ns=1;i=30' },
        { referenceType: 'HasTypeDefinition', isForward: true, targetNodeId: 'ns=1;i=31' },
        { referenceType: 'HasSubtype', isForward: true, targetNodeId: 'ns=1;i=32' },
      ],
      derivedFrom: undefined,
      children: [],
    } as any;

    const nodes = new Map<string, any>([
      ['ns=1;i=30', parent],
      ['ns=1;i=31', typeDef],
      ['ns=1;i=32', baseType],
      ['ns=1;i=33', node],
    ]);

    const onNodeSelect = vi.fn();
    const { container } = render(<DetailPanel selectedNode={node} nodesetData={{ nodes } as any} onNodeSelect={onNodeSelect} />);

    // Parent (use the hierarchy view scope to avoid matching reference links)
    const hierarchyView = container.querySelector('.hierarchy-view') as HTMLElement;
    const parentBtn = within(hierarchyView).getByRole('button', { name: /Parent/i });
    fireEvent.click(parentBtn);
    expect(onNodeSelect).toHaveBeenCalledWith(parent);

    // Type Definition inside hierarchy
    const typeBtn = within(hierarchyView).getByRole('button', { name: /TypeDef/i });
    fireEvent.click(typeBtn);
    expect(onNodeSelect).toHaveBeenCalledWith(typeDef);

    // Base Type inside hierarchy
    const baseBtn = within(hierarchyView).getByRole('button', { name: /BaseType/i });
    fireEvent.click(baseBtn);
    expect(onNodeSelect).toHaveBeenCalledWith(baseType);
  });

  it('toggles raw data JSON view', () => {
    const node = {
      nodeId: 'ns=1;i=40',
      displayName: 'RawNode',
      nodeClass: 'Object',
      references: [],
      children: [],
    } as any;

    const nodes = new Map<string, any>([['ns=1;i=40', node]]);

    render(<DetailPanel selectedNode={node} nodesetData={{ nodes } as any} onNodeSelect={() => {}} />);

    // Extended Information section is collapsed by default; expand it first
    const sectionHeader = screen.getByText('Extended Information');
    fireEvent.click(sectionHeader);

    const toggleBtn = screen.getByRole('button', { name: /Show Raw Data/i });
    fireEvent.click(toggleBtn);
    expect(screen.getByText(/"nodeId": "ns=1;i=40"/)).toBeDefined();
    // Hide
    fireEvent.click(toggleBtn);
    // raw JSON should not be present
    expect(screen.queryByText(/"nodeId": "ns=1;i=40"/)).toBeNull();
  });
});
