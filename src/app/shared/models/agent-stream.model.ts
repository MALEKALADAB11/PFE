export type AgentStreamMessage =
  | {
      type: 'agent_patch';
      run_id: string;
      agent: string;
      patch: Record<string, unknown>;
    }
  | {
      type: 'run_completed';
      run_id: string;
      final_state: Record<string, unknown>;
    };