export default function DotobotWorkspaceGrid({
  centerNode,
  focusedShellContentClass,
  gridGapClass,
  gridTemplateClass,
  historyNode,
  rightNode,
}) {
  return (
    <div className={`flex-1 overflow-hidden ${focusedShellContentClass}`}>
      <div className={`grid h-full min-h-0 transition-all duration-300 ease-out ${gridGapClass} ${gridTemplateClass}`}>
        {historyNode}
        {centerNode}
        {rightNode}
      </div>
    </div>
  );
}
