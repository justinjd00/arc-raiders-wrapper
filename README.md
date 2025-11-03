# Arc Raiders API Client

<div align="center">

![GitHub stars](https://img.shields.io/github/stars/justinjd00/arc-raiders-wrapper?style=social)
![GitHub forks](https://img.shields.io/github/forks/justinjd00/arc-raiders-wrapper?style=social)
![GitHub watchers](https://img.shields.io/github/watchers/justinjd00/arc-raiders-wrapper?style=social)
![GitHub issues](https://img.shields.io/github/issues/justinjd00/arc-raiders-wrapper)
![GitHub license](https://img.shields.io/github/license/justinjd00/arc-raiders-wrapper)
![npm version](https://img.shields.io/npm/v/@justinjd00/arc-raiders-api)
![npm downloads](https://img.shields.io/npm/dm/@justinjd00/arc-raiders-api)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)


</div>

Type-safe TypeScript wrapper for the MetaForge ARC Raiders API. Fully typed, easy to use, and optimized for Arc Raiders game data.

## Installation

```bash
npm install @justinjd00/arc-raiders-api
```

Or with other package managers:

```bash
# Yarn
yarn add @justinjd00/arc-raiders-api

# pnpm
pnpm add @justinjd00/arc-raiders-api

# Bun
bun add @justinjd00/arc-raiders-api
```

### Install from GitHub

```bash
npm install github:justinjd00/arc-raiders-wrapper
```

## Quick Start

```typescript
import { createArcRaidersClient } from '@justinjd00/arc-raiders-api';

const client = createArcRaidersClient({
  baseURL: 'https://metaforge.app/api/arc-raiders',
  timeout: 10000,
});

const items = await client.getItems({ rarity: 'epic' });
console.log(items.data);
```

## Features

-  Fully type-safe with TypeScript
-  Access to items, weapons, armor, quests, ARCs, maps, and traders
-  Filtering and pagination support
-  Robust error handling
-  Simple and intuitive API

## Basic Usage

### Get All Data (Auto-Pagination)

```typescript
import { createArcRaidersClient } from '@justinjd00/arc-raiders-api';

const client = createArcRaidersClient();

const allItems = await client.getAllItems();
const allWeapons = await client.getAllWeapons({ rarity: 'legendary' });
const allQuests = await client.getAllQuests({ difficulty: 'hard' });
const allARCs = await client.getAllARCs();
```

### Get Paginated Data

```typescript
const weapons = await client.getWeapons({ rarity: 'legendary', page: 1, pageSize: 50 });
const quests = await client.getQuests({ difficulty: 'hard', page: 1, pageSize: 20 });
const maps = await client.getMaps();
const traders = await client.getTraders();
```

## Links

- [GitHub Repository](https://github.com/justinjd00/arc-raiders-wrapper)
- [MetaForge ARC Raiders API](https://metaforge.app/arc-raiders/api)
- [ARC Raiders Official Website](https://arcraiders.com/)

---

**Note**: This is an unofficial package and is not affiliated with Embark Studios or Arc Raiders.
