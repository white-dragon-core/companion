import { Request, Response } from 'express';
import { AppState, Place, ProjectInfo } from '../state';
import { ConfigResponse } from '../config';

export function createPollHandler(state: AppState) {
  return async (req: Request, res: Response) => {
    const placeGuid = req.headers['place-guid'] as string;
    const placeName = req.headers['place-name'] as string;
    const placeId = parseInt(req.headers['place-id'] as string, 10);
    const gameName = req.headers['game-name'] as string;
    const projectHash = req.headers['project-hash'] as string;
    const projectDate = req.headers['project-date'] as string;

    if (!placeGuid || !placeName || isNaN(placeId)) {
      console.log('[Poll] Invalid headers - missing required fields');
      return res.status(400).json({ error: 'Invalid headers' });
    }

    // 构建远程项目信息
    const remoteProject: ProjectInfo = {
      name: gameName || '',
      hash: projectHash || '',
      date: projectDate
    };

    // 验证项目是否匹配 (name + hash)
    if (!state.isProjectMatch(remoteProject)) {
      const acceptedProjects = state.getAcceptedProjects();
      return res.status(403).json({
        error: 'Project mismatch',
        studio: {
          name: remoteProject.name,
          hash: remoteProject.hash
        },
        accepted: acceptedProjects.length > 0 ? acceptedProjects : (state.localProject ? [state.localProject] : [])
      });
    }

    const place: Place = {
      name: placeName,
      id: placeId
    };

    // 记录已连接的 place
    if (!state.hasPlaceConnected(placeGuid)) {
      state.recordConnectedPlace(placeGuid, place, remoteProject);
    }

    // 向后兼容: If CLI is configured for a specific game name, check if this is the right game
    if (state.gameName && gameName !== state.gameName) {
      return res.status(403).json({ error: 'This server is handling a different game' });
    }

    const activePlace = state.getActivePlace();

    // 如果还没有 active place，自动将第一个连接的 place 设为 active
    if (!activePlace) {
      state.addPlace(placeGuid, place);
      state.setActivePlace(placeGuid);

      // 准备测试额外选项，包含测试名称过滤
      const testExtraOptions = { ...state.config.test_extra_options };
      if (state.testNamePattern) {
        testExtraOptions.testNamePattern = state.testNamePattern;
      }

      const response: ConfigResponse = {
        testRoots: state.config.roots,
        testExtraOptions: testExtraOptions
      };
      return res.json(response);
    }

    if (activePlace === placeGuid) {
      // 准备测试额外选项，包含测试名称过滤
      const testExtraOptions = { ...state.config.test_extra_options };
      if (state.testNamePattern) {
        testExtraOptions.testNamePattern = state.testNamePattern;
      }

      const response: ConfigResponse = {
        testRoots: state.config.roots,
        testExtraOptions: testExtraOptions
      };
      return res.json(response);
    } else {
      state.addPlace(placeGuid, place);
      return res.status(403).send();
    }
  };
}