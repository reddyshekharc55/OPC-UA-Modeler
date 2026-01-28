import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import VisualizationOptions from './VisualizationOptions';

describe('VisualizationOptions', () => {
  const nodesets = [
    { id: 'n1', name: 'Nodeset A', namespaces: [{ index: 0, uri: 'urn:a', prefix: 'a' }], nodeCount: 5 },
    { id: 'n2', name: 'Nodeset B', namespaces: [], nodeCount: 2 },
  ];

  it('renders selector and active nodeset info', () => {
    const onNodesetSwitch = vi.fn();
    const onViewModeChange = vi.fn();

    render(
      <VisualizationOptions
        nodesetList={nodesets as any}
        activeNodesetId="n1"
        onNodesetSwitch={onNodesetSwitch}
        onNodeSelect={() => {}}
        viewMode="tree"
        onViewModeChange={onViewModeChange}
      />
    );

    const select = screen.getByLabelText(/Active Nodeset/i) as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(screen.getByRole('option', { name: /Nodeset A/i })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Nodeset B/i })).toBeTruthy();

    expect(screen.getByText(/\(5 nodes, 1 NS\)/)).toBeTruthy();
  });

  it('calls onNodesetSwitch when selection changes', () => {
    const onNodesetSwitch = vi.fn();
    const onViewModeChange = vi.fn();

    render(
      <VisualizationOptions
        nodesetList={nodesets as any}
        activeNodesetId="n1"
        onNodesetSwitch={onNodesetSwitch}
        onNodeSelect={() => {}}
        viewMode="tree"
        onViewModeChange={onViewModeChange}
      />
    );

    const select = screen.getByLabelText(/Active Nodeset/i);
    fireEvent.change(select, { target: { value: 'n2' } });

    expect(onNodesetSwitch).toHaveBeenCalledWith('n2');
  });

  it('renders view mode buttons and calls onViewModeChange', () => {
    const onNodesetSwitch = vi.fn();
    const onViewModeChange = vi.fn();

    const { rerender } = render(
      <VisualizationOptions
        nodesetList={nodesets as any}
        activeNodesetId="n1"
        onNodesetSwitch={onNodesetSwitch}
        onNodeSelect={() => {}}
        viewMode="tree"
        onViewModeChange={onViewModeChange}
      />
    );

    const treeBtn = screen.getByText(/Tree/i);
    const graphBtn = screen.getByText(/Graph/i);

    expect(treeBtn.className.includes('active')).toBe(true);

    fireEvent.click(graphBtn);
    expect(onViewModeChange).toHaveBeenCalledWith('graph');

    rerender(
      <VisualizationOptions
        nodesetList={nodesets as any}
        activeNodesetId="n1"
        onNodesetSwitch={onNodesetSwitch}
        onNodeSelect={() => {}}
        viewMode="graph"
        onViewModeChange={onViewModeChange}
      />
    );

    expect(graphBtn.className.includes('active')).toBe(true);
  });

  it("select's value reflects activeNodesetId (controlled select)", () => {
    const onNodesetSwitch = vi.fn();
    const onViewModeChange = vi.fn();

    render(
      <VisualizationOptions
        nodesetList={nodesets as any}
        activeNodesetId="n2"
        onNodesetSwitch={onNodesetSwitch}
        onNodeSelect={() => {}}
        viewMode="tree"
        onViewModeChange={onViewModeChange}
      />
    );

    const select = screen.getByLabelText(/Active Nodeset/i) as HTMLSelectElement;
    expect(select.value).toBe('n2');
  });

  it('does not render nodeset info when activeNodesetId is not found', () => {
    const onNodesetSwitch = vi.fn();
    const onViewModeChange = vi.fn();

    render(
      <VisualizationOptions
        nodesetList={nodesets as any}
        activeNodesetId="missing"
        onNodesetSwitch={onNodesetSwitch}
        onNodeSelect={() => {}}
        viewMode="tree"
        onViewModeChange={onViewModeChange}
      />
    );

    // nodeset-info span should not be present
    expect(screen.queryByText(/\(\d+ nodes, \d+ NS\)/)).toBeNull();
  });

  it('handles empty nodesetList gracefully (no options)', () => {
    const onNodesetSwitch = vi.fn();
    const onViewModeChange = vi.fn();

    render(
      <VisualizationOptions
        nodesetList={[] as any}
        activeNodesetId={''}
        onNodesetSwitch={onNodesetSwitch}
        onNodeSelect={() => {}}
        viewMode="tree"
        onViewModeChange={onViewModeChange}
      />
    );

    const select = screen.getByLabelText(/Active Nodeset/i);
    const options = Array.from((select as HTMLSelectElement).options);
    expect(options.length).toBe(0);
  });

  it('clicking Tree button calls onViewModeChange with "tree"', () => {
    const onNodesetSwitch = vi.fn();
    const onViewModeChange = vi.fn();

    render(
      <VisualizationOptions
        nodesetList={nodesets as any}
        activeNodesetId="n1"
        onNodesetSwitch={onNodesetSwitch}
        onNodeSelect={() => {}}
        viewMode="graph"
        onViewModeChange={onViewModeChange}
      />
    );

    const treeBtn = screen.getByText(/Tree/i);
    fireEvent.click(treeBtn);
    expect(onViewModeChange).toHaveBeenCalledWith('tree');
  });

  it('shows (N nodes, 0 NS) when active nodeset has zero namespaces', () => {
    const onNodesetSwitch = vi.fn();
    const onViewModeChange = vi.fn();

    render(
      <VisualizationOptions
        nodesetList={nodesets as any}
        activeNodesetId="n2"
        onNodesetSwitch={onNodesetSwitch}
        onNodeSelect={() => {}}
        viewMode="tree"
        onViewModeChange={onViewModeChange}
      />
    );

    expect(screen.getByText(/\(2 nodes, 0 NS\)/)).toBeTruthy();
  });

  it('option elements have value attributes matching nodeset ids', () => {
    const onNodesetSwitch = vi.fn();
    const onViewModeChange = vi.fn();

    render(
      <VisualizationOptions
        nodesetList={nodesets as any}
        activeNodesetId="n1"
        onNodesetSwitch={onNodesetSwitch}
        onNodeSelect={() => {}}
        viewMode="tree"
        onViewModeChange={onViewModeChange}
      />
    );

    const opts = screen.getAllByRole('option') as HTMLOptionElement[];
    expect(opts.length).toBe(nodesets.length);
    expect(opts[0].value).toBe('n1');
    expect(opts[1].value).toBe('n2');
  });
});
