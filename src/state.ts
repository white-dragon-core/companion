import { Config } from './config';

export interface Place {
  name: string;
  id: number;
}

export interface ProjectInfo {
  name: string;
  hash: string;
  date?: string;
}

export interface ConnectedPlaceInfo {
  place: Place;
  project: ProjectInfo;
}

export class AppState {
  config: Config;
  places: Map<string, Place> = new Map();
  activePlace: string | null = null;
  onlyLogFailures: boolean;
  gameName: string | null = null;
  testNamePattern: string | null = null;  // 测试名称过滤模式
  connectedPlaces: Map<string, ConnectedPlaceInfo> = new Map();  // 记录已连接过的 place 及其项目信息
  localProject: ProjectInfo | null = null;  // 本地项目信息
  acceptedProjects: Map<string, ProjectInfo> = new Map();  // 已接受的项目信息 (key: hash)

  constructor(config: Config, onlyLogFailures: boolean = false, localProject: ProjectInfo | null = null) {
    this.config = config;
    this.onlyLogFailures = onlyLogFailures;
    this.localProject = localProject;
    
    // 如果有本地项目信息，将其添加到已接受项目列表
    if (localProject) {
      this.acceptedProjects.set(localProject.hash, localProject);
    }
  }

  setActivePlace(placeGuid: string): void {
    this.activePlace = placeGuid;
  }

  getActivePlace(): string | null {
    return this.activePlace;
  }

  addPlace(guid: string, place: Place): void {
    this.places.set(guid, place);
  }

  getPlace(guid: string): Place | undefined {
    return this.places.get(guid);
  }

  getPlaces(): Map<string, Place> {
    return this.places;
  }

  // 验证项目是否匹配 - 改进的多项目支持逻辑
  isProjectMatch(remoteProject: ProjectInfo): boolean {
    // 如果远程项目没有有效的 hash，拒绝连接
    if (!remoteProject.hash || remoteProject.hash === 'unknown') {
      return false;
    }

    // 如果已经接受过这个项目的 hash，允许连接
    if (this.acceptedProjects.has(remoteProject.hash)) {
      const acceptedProject = this.acceptedProjects.get(remoteProject.hash)!;
      // 验证名称是否一致（防止 hash 冲突）
      return acceptedProject.name === remoteProject.name;
    }

    // 如果没有本地项目信息，且这是第一个连接的项目，接受它
    // 注意：只有在真正没有任何项目信息的情况下才接受第一个项目
    if (!this.localProject && this.acceptedProjects.size === 0) {
      this.acceptedProjects.set(remoteProject.hash, remoteProject);
      return true;
    }

    // 如果有本地项目信息，检查是否匹配
    if (this.localProject) {
      const isMatch = this.localProject.name === remoteProject.name &&
                     this.localProject.hash === remoteProject.hash;
      if (isMatch) {
        // 确保添加到已接受项目列表，并清理可能存在的错误项目
        this.acceptedProjects.clear();
        this.acceptedProjects.set(remoteProject.hash, remoteProject);
        return true;
      }
    }

    // 拒绝不匹配的项目
    return false;
  }

  // 记录已连接的 place 及其项目信息
  recordConnectedPlace(placeGuid: string, place: Place, project: ProjectInfo): void {
    this.connectedPlaces.set(placeGuid, { place, project });
  }

  // 检查 place 是否已经连接过
  hasPlaceConnected(placeGuid: string): boolean {
    return this.connectedPlaces.has(placeGuid);
  }

  // 获取已接受的项目列表
  getAcceptedProjects(): ProjectInfo[] {
    return Array.from(this.acceptedProjects.values());
  }

  // 获取当前连接的项目信息（基于 active place）
  getCurrentProjectInfo(): ProjectInfo | null {
    if (!this.activePlace) {
      return null;
    }
    const connectedInfo = this.connectedPlaces.get(this.activePlace);
    return connectedInfo ? connectedInfo.project : null;
  }
}