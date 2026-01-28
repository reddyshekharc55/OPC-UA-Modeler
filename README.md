# OPC UA Modeler

A web-based OPC UA modeler built with React, TypeScript, and Siemens IX framework. 
Currently this application allows you to import and view OPC UA nodeset XML files in an intuitive interface similar to the Siemens OPC UA Modeling Editor.

## Features

- 📁 **File Import**: Drag-and-drop XML file upload with validation
- 🌳 **Tree Navigation**: Hierarchical view of OPC UA nodes with expandable/collapsible structure
- 📊 **Data Grid**: Comprehensive table view with sorting and filtering capabilities
- 🔍 **Search**: Quick search across node properties
- 🎨 **Siemens IX Design**: Professional UI using Siemens IX component library
- 📱 **Responsive**: Resizable split-pane layout

## Supported Features

The viewer displays the following node information:
- Display Name
- Node Class
- Data Type
- Value Rank
- Is Mandatory
- Type
- Derived From
- Description

## Technology Stack

- **React 18** - UI framework
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool
- **Siemens IX** - Enterprise UI component library
- **xml2js** - XML parsing

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd OPC-UA-Modeler
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

## Running Tests

Run the concise commands below to execute the project's Vitest tests.

- Run all tests:

```bash
npm run test
```

- Run a single test file:

```bash
npx vitest run src/services/file-import.service.test.ts
```

- Run tests interactively (UI):

```bash
npm run test:ui
```

Notes:
- Use `npx vitest run --dir src/services --reporter verbose` for verbose output while developing service tests.
- The test environment includes `jsdom`, so browser-like APIs such as `File` and `DOMParser` are available.

## Usage

1. **Import a Nodeset**: Click the upload area or drag-and-drop an OPC UA nodeset XML file
2. **Navigate**: Use the tree view on the left to explore the node hierarchy
3. **View Details**: Select nodes to view their details in the data grid
4. **Search**: Use the search box to filter nodes by name or properties
5. **Sort**: Click column headers to sort the data

## Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Project Structure

```
src/
├── App.tsx                # Main application component
└── main.tsx              # Application entry point
```

## OPC UA Nodeset Format

This viewer supports OPC UA Nodeset2 XML format with the following node types:
- Object
- Variable
- Method
- ObjectType
- VariableType
- ReferenceType
- DataType
- View

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.


## Acknowledgments

- Built with [Siemens IX](https://ix.siemens.io/)
- OPC UA specification by [OPC Foundation](https://opcfoundation.org/)
