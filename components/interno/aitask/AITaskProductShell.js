import { useState } from "react";
import AITaskExecutionPane from "./AITaskExecutionPane";
import AITaskQueuePane from "./AITaskQueuePane";
import AITaskTechnicalRail from "./AITaskTechnicalRail";
import WorkspaceHeader from "./WorkspaceHeader";

export default function AITaskProductShell(props) {
  const [showTechnicalRail, setShowTechnicalRail] = useState(true);
  const [railTab, setRailTab] = useState("context");

  return (
    <div className="space-y-5">
      <WorkspaceHeader {...props.headerProps} />
      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <AITaskQueuePane hasMoreTasks={props.hasMoreTasks} onLoadMoreTasks={props.onLoadMoreTasks} selectedTaskId={props.selectedTaskId} setSelectedTaskId={props.setSelectedTaskId} taskColumns={props.taskColumns} tasks={props.visibleTasks} />
        <AITaskExecutionPane {...props.executionProps} selectedTask={props.selectedTask} />
        <div className="2xl:block hidden">
          <AITaskTechnicalRail contextRailProps={props.contextRailProps} railTab={railTab} runsPaneProps={props.runsPaneProps} setRailTab={setRailTab} setShowTechnicalRail={setShowTechnicalRail} showTechnicalRail={showTechnicalRail} />
        </div>
      </div>
      <div className="block 2xl:hidden">
        <AITaskTechnicalRail contextRailProps={props.contextRailProps} railTab={railTab} runsPaneProps={props.runsPaneProps} setRailTab={setRailTab} setShowTechnicalRail={setShowTechnicalRail} showTechnicalRail={showTechnicalRail} />
      </div>
    </div>
  );
}
