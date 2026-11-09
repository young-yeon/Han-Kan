import { requireChatGPTUser } from "./chatgpt-auth";
import ChefApp from "@/components/chef-app";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireChatGPTUser("/");
  return <ChefApp displayName={user.displayName} />;
}
