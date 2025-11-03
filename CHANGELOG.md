# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2025-01-03

### Added
- In-memory caching with configurable TTL (default: 5 minutes)
- React Hooks: `useArcRaiders`, `useItems`, `useWeapons`, `useQuests`, `useARCs`
- CLI tool: `arc-raiders` command-line interface
- Data export functions: `exportToJSON`, `exportToCSV`, `exportToJSONString`, `exportToCSVString`
- Analytics & statistics: `getWeaponStats`, `getArmorStats`, `getRarityDistribution`, `findBestWeapon`, `findBestArmor`
- `clearCache()` method for manual cache management

### Changed
- Improved client configuration with `cacheEnabled` and `cacheTTL` options
- Enhanced README with examples for all new features

## [1.0.1] - 2025-11-03

### Fixed
- Fixed TraderItem type definition to match API response
- Fixed getTraders() return type to match actual API format

## [1.0.0] - 2025-11-03

### Added
- Initial release
- Type-safe client for MetaForge ARC Raiders API
- Support for items, weapons, armor, quests, ARCs, maps, and traders
- Filtering and pagination support
- Global search functionality
- Comprehensive TypeScript types
- Error handling with custom error types

[Unreleased]: https://github.com/justinjd00/arc-raiders-wrapper/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/justinjd00/arc-raiders-wrapper/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/justinjd00/arc-raiders-wrapper/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/justinjd00/arc-raiders-wrapper/releases/tag/v1.0.0

