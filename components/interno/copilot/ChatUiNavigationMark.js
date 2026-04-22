export default function ChatUiNavigationMark({ isLightTheme }) {
  return (
    <div className="flex flex-col items-center gap-1 px-2 py-6 max-md:hidden">
      <span className={`h-8 w-1 rounded-full ${isLightTheme ? "bg-[#C9D5E1]" : "bg-[#31433D]"}`} />
      <span className={`h-3 w-1 rounded-full ${isLightTheme ? "bg-[#D9E3EC]" : "bg-[#24312D]"}`} />
      <span className={`h-3 w-1 rounded-full ${isLightTheme ? "bg-[#D9E3EC]" : "bg-[#24312D]"}`} />
    </div>
  );
}
