export const creatorRoutes = [
  {
    path: "/creator-studio",
    name: "CreatorStudio",
    component: () => import("../../views/user-center/CreateStudio/index.vue"),
    meta: { upcoming: true },
  },
];
